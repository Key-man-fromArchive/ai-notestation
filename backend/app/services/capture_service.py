"""External content capture service for URL, arXiv, and PubMed."""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from datetime import UTC, datetime

import html2text
import httpx
from pydantic import BaseModel
from readability import Document

logger = logging.getLogger(__name__)

_h2t = html2text.HTML2Text()
_h2t.ignore_links = False
_h2t.ignore_images = False
_h2t.body_width = 0


class CaptureResult(BaseModel):
    """Result of a content capture operation."""

    title: str
    content_html: str
    content_text: str
    tags: list[str]
    metadata: dict


class CaptureService:
    """Captures external content from URL, arXiv, and PubMed."""

    _TIMEOUT = 15.0
    _HEADERS = {
        "User-Agent": "LabNoteAI/1.0 (research note tool; mailto:noreply@labnote.ai)",
    }

    # ------------------------------------------------------------------
    # URL capture
    # ------------------------------------------------------------------
    async def capture_url(self, url: str) -> CaptureResult:
        """Fetch a web page, extract article content, and convert to Markdown."""
        async with httpx.AsyncClient(timeout=self._TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=self._HEADERS)
            resp.raise_for_status()

        raw_html = resp.text
        doc = Document(raw_html)
        article_html = doc.summary()
        title = doc.short_title() or doc.title() or url

        content_text = _h2t.handle(article_html).strip()

        # Build styled note HTML
        content_html = f'<h1>{_esc(title)}</h1><p><a href="{_esc(url)}">{_esc(url)}</a></p><hr/>{article_html}'

        metadata = {
            "capture_source": "url",
            "source_url": url,
            "fetched_at": datetime.now(UTC).isoformat(),
        }

        # Extract OG metadata if present
        og = _extract_og_meta(raw_html)
        if og.get("author"):
            metadata["author"] = og["author"]
        if og.get("description"):
            metadata["description"] = og["description"]

        return CaptureResult(
            title=title,
            content_html=content_html,
            content_text=content_text,
            tags=["captured", "web"],
            metadata=metadata,
        )

    # ------------------------------------------------------------------
    # arXiv capture
    # ------------------------------------------------------------------
    async def capture_arxiv(self, arxiv_id: str) -> CaptureResult:
        """Fetch arXiv paper metadata via Atom API."""
        arxiv_id = arxiv_id.strip()
        if not re.match(r"^\d{4}\.\d{4,5}(v\d+)?$", arxiv_id):
            raise ValueError(f"Invalid arXiv ID format: {arxiv_id}")

        api_url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
        async with httpx.AsyncClient(timeout=self._TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(api_url, headers=self._HEADERS)
            resp.raise_for_status()

        root = ET.fromstring(resp.text)  # noqa: S314
        ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}

        entry = root.find("atom:entry", ns)
        if entry is None:
            raise ValueError(f"arXiv paper not found: {arxiv_id}")

        # Check for error (arXiv returns an entry with id containing "api/errors" for invalid IDs)
        entry_id = entry.findtext("atom:id", default="", namespaces=ns)
        if "api/errors" in entry_id:
            raise ValueError(f"arXiv paper not found: {arxiv_id}")

        title = _clean_ws(entry.findtext("atom:title", default="", namespaces=ns))
        abstract = _clean_ws(entry.findtext("atom:summary", default="", namespaces=ns))
        published = entry.findtext("atom:published", default="", namespaces=ns)[:10]

        authors = [
            _clean_ws(a.findtext("atom:name", default="", namespaces=ns)) for a in entry.findall("atom:author", ns)
        ]

        categories = [c.get("term", "") for c in entry.findall("atom:category", ns) if c.get("term")]

        # DOI and PDF links
        doi = ""
        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"
        for link in entry.findall("atom:link", ns):
            if link.get("title") == "doi":
                doi = link.get("href", "")
            if link.get("title") == "pdf" or (link.get("type") == "application/pdf"):
                pdf_url = link.get("href", pdf_url)

        abs_url = f"https://arxiv.org/abs/{arxiv_id}"

        # Build note HTML
        authors_str = ", ".join(authors) if authors else "Unknown"
        content_html = (
            f"<h1>{_esc(title)}</h1>"
            f"<p><strong>Authors:</strong> {_esc(authors_str)}</p>"
            f"<p><strong>Published:</strong> {_esc(published)}</p>"
            f'<p><strong>arXiv:</strong> <a href="{_esc(abs_url)}">{_esc(arxiv_id)}</a>'
            f' | <a href="{_esc(pdf_url)}">PDF</a>'
            f"{f' | <a href="{_esc(doi)}">DOI</a>' if doi else ''}"
            f"</p>"
            f"<p><strong>Categories:</strong> {_esc(', '.join(categories))}</p>"
            f"<hr/>"
            f"<h2>Abstract</h2>"
            f"<p>{_esc(abstract)}</p>"
        )

        content_text = (
            f"{title}\n\nAuthors: {authors_str}\nPublished: {published}\narXiv: {arxiv_id}\n\nAbstract:\n{abstract}"
        )

        tags = ["captured", "arxiv"]
        if categories:
            tags.append(categories[0])

        metadata = {
            "capture_source": "arxiv",
            "arxiv_id": arxiv_id,
            "authors": authors,
            "published": published,
            "categories": categories,
            "pdf_url": pdf_url,
            "abs_url": abs_url,
        }
        if doi:
            metadata["doi"] = doi

        return CaptureResult(
            title=title,
            content_html=content_html,
            content_text=content_text,
            tags=tags,
            metadata=metadata,
        )

    # ------------------------------------------------------------------
    # PubMed capture (with PMC full-text + Unpaywall OA chain)
    # ------------------------------------------------------------------
    async def capture_pubmed(self, pmid: str) -> CaptureResult:
        """Fetch PubMed article with full-text chain: PMID → PMC → Unpaywall."""
        pmid = pmid.strip()
        if not pmid.isdigit():
            raise ValueError(f"Invalid PubMed ID (must be numeric): {pmid}")

        async with httpx.AsyncClient(timeout=self._TIMEOUT, follow_redirects=True) as client:
            # Step 1: Fetch PubMed metadata + abstract
            api_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pmid}&retmode=xml"
            resp = await client.get(api_url, headers=self._HEADERS)
            resp.raise_for_status()

            root = ET.fromstring(resp.text)  # noqa: S314
            article = root.find(".//Article")
            if article is None:
                raise ValueError(f"PubMed article not found: {pmid}")

            title = _clean_ws(article.findtext("ArticleTitle", default=f"PMID:{pmid}"))

            # Abstract
            abstract_parts = []
            for at in article.findall(".//AbstractText"):
                label = at.get("Label", "")
                text = _elem_text(at)
                if label:
                    abstract_parts.append(f"**{label}**: {text}")
                else:
                    abstract_parts.append(text)
            abstract = "\n\n".join(abstract_parts)

            # Authors
            authors = []
            for author in article.findall(".//Author"):
                last = author.findtext("LastName", default="")
                fore = author.findtext("ForeName", default="")
                if last:
                    authors.append(f"{last} {fore}".strip())

            # Journal
            journal_el = article.find("Journal")
            journal_title = journal_el.findtext("Title", default="") if journal_el is not None else ""
            journal_abbrev = journal_el.findtext("ISOAbbreviation", default="") if journal_el is not None else ""

            # Publication date
            pub_date_el = root.find(".//PubDate")
            pub_year = pub_date_el.findtext("Year", default="") if pub_date_el is not None else ""
            pub_month = pub_date_el.findtext("Month", default="") if pub_date_el is not None else ""
            pub_date = f"{pub_year} {pub_month}".strip()

            # DOI
            doi = ""
            for eid in root.findall(".//ArticleId"):
                if eid.get("IdType") == "doi":
                    doi = (eid.text or "").strip()

            # MeSH terms
            mesh_terms = [
                mh.findtext("DescriptorName", default="")
                for mh in root.findall(".//MeshHeading")
                if mh.findtext("DescriptorName")
            ]

            # Step 2: Try PMC full-text chain
            pmcid = ""
            fulltext_html = ""
            fulltext_source = ""
            oa_pdf_url = ""

            # 2a: PMID → PMCID conversion (new PMC API endpoint, 2025+)
            try:
                conv_url = (
                    f"https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/"
                    f"?ids={pmid}&format=json&tool=LabNoteAI&email=noreply@labnote.ai"
                )
                conv_resp = await client.get(conv_url, headers=self._HEADERS)
                if conv_resp.status_code == 200:
                    conv_data = conv_resp.json()
                    records = conv_data.get("records", [])
                    if records and records[0].get("pmcid"):
                        pmcid = records[0]["pmcid"]
                        logger.info("PMID %s → %s", pmid, pmcid)
            except Exception:
                logger.warning("PMC ID conversion failed for PMID %s", pmid)

            # 2b: Fetch PMC full-text XML if PMCID exists
            if pmcid:
                try:
                    pmc_url = (
                        f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
                        f"?db=pmc&id={pmcid}&retmode=xml"
                    )
                    pmc_resp = await client.get(pmc_url, headers=self._HEADERS, timeout=30.0)
                    if pmc_resp.status_code == 200:
                        fulltext_html = _extract_pmc_fulltext(pmc_resp.text)
                        if fulltext_html:
                            fulltext_source = "pmc"
                            logger.info("PMC full-text extracted for %s (%d chars)", pmcid, len(fulltext_html))
                        else:
                            logger.warning("PMC XML returned but no body sections found for %s", pmcid)
                    else:
                        logger.warning("PMC efetch returned %d for %s", pmc_resp.status_code, pmcid)
                except Exception as exc:
                    logger.warning("PMC full-text fetch failed for %s: %s", pmcid, exc)

            # 2c: Unpaywall OA lookup if no full-text yet and DOI exists
            if not fulltext_html and doi:
                try:
                    unpaywall_url = f"https://api.unpaywall.org/v2/{doi}?email=noreply@labnote.ai"
                    oa_resp = await client.get(unpaywall_url, headers=self._HEADERS)
                    if oa_resp.status_code == 200:
                        oa_data = oa_resp.json()
                        best_loc = oa_data.get("best_oa_location") or {}
                        oa_pdf_url = best_loc.get("url_for_pdf", "") or best_loc.get("url", "")
                except Exception:
                    logger.debug("Unpaywall lookup failed for DOI %s", doi)

        pubmed_url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        authors_str = ", ".join(authors) if authors else "Unknown"

        # Build note HTML — header section
        content_html = (
            f"<h1>{_esc(title)}</h1>"
            f"<p><strong>Authors:</strong> {_esc(authors_str)}</p>"
            f"<p><strong>Journal:</strong> {_esc(journal_title or journal_abbrev)}</p>"
            f"<p><strong>Published:</strong> {_esc(pub_date)}</p>"
            f'<p><strong>PubMed:</strong> <a href="{_esc(pubmed_url)}">{_esc(pmid)}</a>'
        )
        if pmcid:
            pmc_link = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"
            content_html += f' | <a href="{_esc(pmc_link)}">PMC: {_esc(pmcid)}</a>'
        if doi:
            content_html += f' | <a href="https://doi.org/{_esc(doi)}">DOI: {_esc(doi)}</a>'
        if oa_pdf_url:
            content_html += f' | <a href="{_esc(oa_pdf_url)}">Open Access PDF</a>'
        content_html += "</p>"

        if mesh_terms:
            content_html += f"<p><strong>MeSH:</strong> {_esc(', '.join(mesh_terms[:10]))}</p>"

        # Body: full-text if available, otherwise abstract
        content_html += "<hr/>"
        if fulltext_html:
            content_html += fulltext_html
        elif abstract:
            content_html += f"<h2>Abstract</h2><p>{abstract}</p>"
        else:
            content_html += "<p><em>No abstract available.</em></p>"

        # Plain text version
        if fulltext_html:
            content_text_body = _h2t.handle(fulltext_html).strip()
        else:
            content_text_body = f"Abstract:\n{abstract or '(no abstract)'}"

        content_text = (
            f"{title}\n\nAuthors: {authors_str}\n"
            f"Journal: {journal_title or journal_abbrev}\nPublished: {pub_date}\n"
            f"PMID: {pmid}"
            f"{f'  PMCID: {pmcid}' if pmcid else ''}\n\n"
            f"{content_text_body}"
        )

        metadata: dict = {
            "capture_source": "pubmed",
            "pmid": pmid,
            "authors": authors,
            "journal": journal_title or journal_abbrev,
            "pub_date": pub_date,
            "pubmed_url": pubmed_url,
        }
        if pmcid:
            metadata["pmcid"] = pmcid
        if doi:
            metadata["doi"] = doi
        if mesh_terms:
            metadata["mesh_terms"] = mesh_terms
        if fulltext_source:
            metadata["fulltext_source"] = fulltext_source
        if oa_pdf_url:
            metadata["oa_pdf_url"] = oa_pdf_url

        tags = ["captured", "pubmed"]
        if fulltext_source:
            tags.append("fulltext")

        return CaptureResult(
            title=title,
            content_html=content_html,
            content_text=content_text,
            tags=tags,
            metadata=metadata,
        )


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _esc(text: str) -> str:
    """Minimal HTML-escape for inserting text into HTML templates."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _clean_ws(text: str) -> str:
    """Collapse whitespace (newlines etc.) into single spaces."""
    return re.sub(r"\s+", " ", text).strip()


def _elem_text(elem: ET.Element) -> str:
    """Extract full text content from an XML element, including tail text of children."""
    return "".join(elem.itertext()).strip()


def _extract_pmc_fulltext(xml_text: str) -> str:
    """Extract structured full-text HTML from PMC XML (JATS format).

    Extracts body sections (Introduction, Methods, Results, Discussion, etc.)
    and converts them to clean HTML suitable for a research note.
    """
    try:
        root = ET.fromstring(xml_text)  # noqa: S314
    except ET.ParseError:
        return ""

    body = root.find(".//body")
    if body is None:
        return ""

    parts: list[str] = []
    for sec in body.findall("sec"):
        sec_title = sec.findtext("title", default="")
        if sec_title:
            parts.append(f"<h2>{_esc(sec_title)}</h2>")

        for p in sec.findall("p"):
            text = _elem_text(p)
            if text:
                parts.append(f"<p>{_esc(text)}</p>")

        # Handle nested subsections (one level deep)
        for subsec in sec.findall("sec"):
            sub_title = subsec.findtext("title", default="")
            if sub_title:
                parts.append(f"<h3>{_esc(sub_title)}</h3>")
            for p in subsec.findall("p"):
                text = _elem_text(p)
                if text:
                    parts.append(f"<p>{_esc(text)}</p>")

    # If no structured sections, try paragraphs directly under body
    if not parts:
        for p in body.findall("p"):
            text = _elem_text(p)
            if text:
                parts.append(f"<p>{_esc(text)}</p>")

    return "\n".join(parts)


def _extract_og_meta(html: str) -> dict:
    """Extract Open Graph metadata from raw HTML."""
    result: dict[str, str] = {}
    for match in re.finditer(r'<meta\s+(?:property|name)=["\']og:(\w+)["\']\s+content=["\']([^"\']*)["\']', html, re.I):
        result[match.group(1)] = match.group(2)
    # Also try author meta
    author_match = re.search(r'<meta\s+name=["\']author["\']\s+content=["\']([^"\']*)["\']', html, re.I)
    if author_match:
        result["author"] = author_match.group(1)
    return result
