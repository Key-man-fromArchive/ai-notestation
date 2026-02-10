"""Query preprocessor with Korean morpheme analysis via kiwipiepy.

Analyzes search queries to extract morphemes, detect language,
and build optimized tsquery expressions for PostgreSQL full-text search.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from typing import NamedTuple

from kiwipiepy import Kiwi


class QueryAnalysis(NamedTuple):
    """Result of analyzing a search query.

    Attributes:
        original: The original query string.
        morphemes: Korean base forms extracted by Kiwi.
        language: Detected language ("ko", "en", or "mixed").
        is_single_term: Whether the query is a single search term.
        tsquery_expr: OR-joined tsquery expression for PostgreSQL.
        normalized: Normalized text for embedding search.
    """

    original: str
    morphemes: list[str]
    language: str
    is_single_term: bool
    tsquery_expr: str
    normalized: str


# Kiwi POS tags for content words
_CONTENT_TAGS = {"NNG", "NNP", "VV", "VA", "SL"}

# Regex: at least one Hangul character
_HANGUL_RE = re.compile(r"[\uAC00-\uD7A3\u3131-\u3163\u1100-\u11FF]")
# Regex: at least one Latin letter
_LATIN_RE = re.compile(r"[a-zA-Z]")


@lru_cache(maxsize=1)
def _get_kiwi() -> Kiwi:
    """Return a cached Kiwi instance (singleton)."""
    return Kiwi()


def _detect_language(text: str) -> str:
    """Detect the primary language of a text string.

    Returns:
        "ko" if only Hangul, "en" if only Latin, "mixed" otherwise.
    """
    has_korean = bool(_HANGUL_RE.search(text))
    has_english = bool(_LATIN_RE.search(text))

    if has_korean and has_english:
        return "mixed"
    if has_korean:
        return "ko"
    return "en"


def _extract_korean_morphemes(text: str) -> list[str]:
    """Extract content-word morphemes from Korean text using Kiwi.

    Extracts nouns (NNG, NNP), verbs (VV), adjectives (VA),
    and foreign words (SL) as base forms.

    Args:
        text: Input text to analyze.

    Returns:
        List of base-form morphemes (deduplicated, order-preserved).
    """
    kiwi = _get_kiwi()
    result = kiwi.tokenize(text)

    seen: set[str] = set()
    morphemes: list[str] = []
    for token in result:
        if token.tag in _CONTENT_TAGS and token.form not in seen:
            seen.add(token.form)
            morphemes.append(token.form)

    return morphemes


def _build_tsquery_expr(morphemes: list[str], original_tokens: list[str]) -> str:
    """Build a tsquery expression from morphemes and original tokens.

    Combines morphemes and original whitespace-split tokens with OR (|),
    deduplicating and escaping single quotes.

    Args:
        morphemes: Extracted morphemes from Kiwi.
        original_tokens: Whitespace-split tokens from the original query.

    Returns:
        A tsquery expression string, e.g. "실험 | 프로토콜 | protocol".
        Empty string if no terms.
    """
    seen: set[str] = set()
    terms: list[str] = []

    for m in morphemes:
        lower = m.lower()
        if lower and lower not in seen:
            seen.add(lower)
            terms.append(lower.replace("'", "''"))

    for t in original_tokens:
        lower = t.lower().strip()
        if lower and lower not in seen:
            seen.add(lower)
            terms.append(lower.replace("'", "''"))

    return " | ".join(terms)


def analyze_query(query: str) -> QueryAnalysis:
    """Analyze a search query for language, morphemes, and tsquery expression.

    Args:
        query: Raw search query string.

    Returns:
        QueryAnalysis with all fields populated.
        For empty queries, returns an analysis with empty morphemes and tsquery_expr.
    """
    stripped = query.strip()
    if not stripped:
        return QueryAnalysis(
            original=query,
            morphemes=[],
            language="en",
            is_single_term=False,
            tsquery_expr="",
            normalized="",
        )

    # Normalize unicode (NFC for consistent Korean)
    normalized = unicodedata.normalize("NFC", stripped)
    language = _detect_language(normalized)

    # Split into whitespace tokens
    tokens = normalized.split()
    is_single_term = len(tokens) == 1

    # Extract morphemes (Korean analysis) or use tokens directly for English
    morphemes = (
        _extract_korean_morphemes(normalized) if language in ("ko", "mixed") else [t.lower() for t in tokens]
    )

    # Build tsquery expression
    tsquery_expr = _build_tsquery_expr(morphemes, tokens)

    return QueryAnalysis(
        original=query,
        morphemes=morphemes,
        language=language,
        is_single_term=is_single_term,
        tsquery_expr=tsquery_expr,
        normalized=normalized,
    )
