"""Tests for the query preprocessor with Korean morpheme analysis.

Verifies language detection, morpheme extraction, tsquery expression
building, and edge cases.
"""

from __future__ import annotations

import pytest

from app.search.query_preprocessor import (
    QueryAnalysis,
    _detect_language,
    analyze_query,
)


# ---------------------------------------------------------------------------
# 1. Language detection
# ---------------------------------------------------------------------------


class TestDetectLanguage:
    """Tests for _detect_language."""

    def test_detect_language_korean(self):
        """Pure Korean text is detected as 'ko'."""
        assert _detect_language("실험 프로토콜") == "ko"

    def test_detect_language_korean_single(self):
        """Single Korean word."""
        assert _detect_language("연구") == "ko"

    def test_detect_language_english(self):
        """Pure English text is detected as 'en'."""
        assert _detect_language("experiment protocol") == "en"

    def test_detect_language_english_single(self):
        """Single English word."""
        assert _detect_language("PCR") == "en"

    def test_detect_language_mixed(self):
        """Mixed Korean+English text is detected as 'mixed'."""
        assert _detect_language("PCR 실험 결과") == "mixed"

    def test_detect_language_mixed_english_first(self):
        """Mixed with English first."""
        assert _detect_language("protein 분석") == "mixed"

    def test_detect_language_numbers_only(self):
        """Numbers-only text defaults to 'en'."""
        assert _detect_language("12345") == "en"

    def test_detect_language_symbols(self):
        """Symbols-only text defaults to 'en'."""
        assert _detect_language("@#$%") == "en"


# ---------------------------------------------------------------------------
# 2. Korean morpheme extraction
# ---------------------------------------------------------------------------


class TestAnalyzeQueryKoreanMorphemes:
    """Tests for Korean morpheme extraction via kiwipiepy."""

    def test_analyze_query_korean_morphemes(self):
        """Korean text is split into content-word morphemes."""
        result = analyze_query("실험 프로토콜 작성")
        assert isinstance(result, QueryAnalysis)
        assert result.language == "ko"
        # Should contain base forms of Korean content words
        assert len(result.morphemes) > 0
        # "실험" and "프로토콜" should be extracted as nouns
        morpheme_set = set(result.morphemes)
        assert "실험" in morpheme_set
        assert "프로토콜" in morpheme_set

    def test_analyze_query_korean_single_term(self):
        """Single Korean term."""
        result = analyze_query("연구")
        assert result.language == "ko"
        assert result.is_single_term is True
        assert len(result.morphemes) >= 1

    def test_analyze_query_korean_verb_extraction(self):
        """Korean verbs are extracted as base forms."""
        result = analyze_query("세포를 배양했다")
        assert result.language == "ko"
        morpheme_set = set(result.morphemes)
        # Should contain nouns and verb stems
        assert "세포" in morpheme_set


# ---------------------------------------------------------------------------
# 3. English passthrough
# ---------------------------------------------------------------------------


class TestAnalyzeQueryEnglish:
    """Tests for English query analysis."""

    def test_analyze_query_english_passthrough(self):
        """English words pass through as lowercase tokens."""
        result = analyze_query("Protein Analysis")
        assert result.language == "en"
        assert "protein" in result.morphemes
        assert "analysis" in result.morphemes

    def test_analyze_query_english_single_term(self):
        """Single English term."""
        result = analyze_query("PCR")
        assert result.language == "en"
        assert result.is_single_term is True
        assert "pcr" in result.morphemes


# ---------------------------------------------------------------------------
# 4. Empty and edge cases
# ---------------------------------------------------------------------------


class TestAnalyzeQueryEmpty:
    """Tests for empty and edge case queries."""

    def test_analyze_query_empty(self):
        """Empty query returns empty analysis."""
        result = analyze_query("")
        assert result.morphemes == []
        assert result.tsquery_expr == ""
        assert result.normalized == ""
        assert result.language == "en"

    def test_analyze_query_whitespace_only(self):
        """Whitespace-only query returns empty analysis."""
        result = analyze_query("   \t  ")
        assert result.morphemes == []
        assert result.tsquery_expr == ""

    def test_analyze_query_preserves_original(self):
        """Original query is preserved."""
        result = analyze_query("  test query  ")
        assert result.original == "  test query  "


# ---------------------------------------------------------------------------
# 5. tsquery expression format
# ---------------------------------------------------------------------------


class TestTsqueryExprFormat:
    """Tests for OR-joined tsquery expression format."""

    def test_tsquery_expr_or_format(self):
        """tsquery_expr uses OR (|) to join terms."""
        result = analyze_query("protein analysis")
        # Should contain | separator
        assert " | " in result.tsquery_expr
        # Should contain both terms
        assert "protein" in result.tsquery_expr
        assert "analysis" in result.tsquery_expr

    def test_tsquery_expr_korean_or_format(self):
        """Korean tsquery_expr uses OR (|) to join morphemes."""
        result = analyze_query("실험 프로토콜")
        assert " | " in result.tsquery_expr
        assert "실험" in result.tsquery_expr
        assert "프로토콜" in result.tsquery_expr

    def test_tsquery_expr_single_term_no_pipe(self):
        """Single term tsquery_expr has no OR separator."""
        result = analyze_query("PCR")
        assert " | " not in result.tsquery_expr
        assert "pcr" in result.tsquery_expr

    def test_tsquery_expr_deduplicates(self):
        """Duplicate terms are removed from tsquery_expr."""
        result = analyze_query("test test test")
        # Should only have "test" once
        assert result.tsquery_expr.count("test") == 1

    def test_tsquery_expr_empty_for_empty_query(self):
        """Empty query produces empty tsquery_expr."""
        result = analyze_query("")
        assert result.tsquery_expr == ""


# ---------------------------------------------------------------------------
# 6. Mixed language queries
# ---------------------------------------------------------------------------


class TestMixedLanguageQueries:
    """Tests for mixed Korean+English queries."""

    def test_mixed_query_analysis(self):
        """Mixed query extracts morphemes from both languages."""
        result = analyze_query("PCR 실험 결과")
        assert result.language == "mixed"
        assert len(result.morphemes) > 0
        # Should include both Korean nouns and English tokens
        morpheme_lower = [m.lower() for m in result.morphemes]
        assert "실험" in morpheme_lower
        assert "결과" in morpheme_lower

    def test_mixed_query_tsquery_includes_all(self):
        """Mixed query tsquery_expr includes terms from both languages."""
        result = analyze_query("DNA 추출 방법")
        assert "추출" in result.tsquery_expr
