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
        async with httpx.AsyncClient(timeout=self._TIMEOUT) as client:
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
    # PubMed capture
    # ------------------------------------------------------------------
    async def capture_pubmed(self, pmid: str) -> CaptureResult:
        """Fetch PubMed article metadata via NCBI E-utilities."""
        pmid = pmid.strip()
        if not pmid.isdigit():
            raise ValueError(f"Invalid PubMed ID (must be numeric): {pmid}")

        api_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pmid}&retmode=xml"
        async with httpx.AsyncClient(timeout=self._TIMEOUT) as client:
            resp = await client.get(api_url, headers=self._HEADERS)
            resp.raise_for_status()

        root = ET.fromstring(resp.text)  # noqa: S314
        article = root.find(".//Article")
        if article is None:
            raise ValueError(f"PubMed article not found: {pmid}")

        title = _clean_ws(article.findtext("ArticleTitle", default=f"PMID:{pmid}"))

        # Abstract (may have multiple AbstractText sections)
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

        pubmed_url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        authors_str = ", ".join(authors) if authors else "Unknown"

        # Build note HTML
        content_html = (
            f"<h1>{_esc(title)}</h1>"
            f"<p><strong>Authors:</strong> {_esc(authors_str)}</p>"
            f"<p><strong>Journal:</strong> {_esc(journal_title or journal_abbrev)}</p>"
            f"<p><strong>Published:</strong> {_esc(pub_date)}</p>"
            f'<p><strong>PubMed:</strong> <a href="{_esc(pubmed_url)}">{_esc(pmid)}</a>'
            f"{f' | <a href="https://doi.org/{_esc(doi)}">DOI: {_esc(doi)}</a>' if doi else ''}"
            f"</p>"
        )
        if mesh_terms:
            content_html += f"<p><strong>MeSH:</strong> {_esc(', '.join(mesh_terms[:10]))}</p>"
        content_html += "<hr/>"
        if abstract:
            content_html += f"<h2>Abstract</h2><p>{abstract}</p>"
        else:
            content_html += "<p><em>No abstract available.</em></p>"

        content_text = (
            f"{title}\n\nAuthors: {authors_str}\n"
            f"Journal: {journal_title or journal_abbrev}\nPublished: {pub_date}\n"
            f"PMID: {pmid}\n\nAbstract:\n{abstract or '(no abstract)'}"
        )

        metadata = {
            "capture_source": "pubmed",
            "pmid": pmid,
            "authors": authors,
            "journal": journal_title or journal_abbrev,
            "pub_date": pub_date,
            "pubmed_url": pubmed_url,
        }
        if doi:
            metadata["doi"] = doi
        if mesh_terms:
            metadata["mesh_terms"] = mesh_terms

        return CaptureResult(
            title=title,
            content_html=content_html,
            content_text=content_text,
            tags=["captured", "pubmed"],
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
