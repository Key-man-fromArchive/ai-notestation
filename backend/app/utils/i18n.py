"""Internationalization utilities for LabNote AI backend.

Provides language detection from HTTP Accept-Language header
and a simple message translation function.
"""

from __future__ import annotations

from fastapi import Request

SUPPORTED_LANGUAGES = ("ko", "en")
DEFAULT_LANGUAGE = "ko"


def get_language(request: Request) -> str:
    """Extract preferred language from the Accept-Language header.

    Returns 'ko' or 'en'. Defaults to 'ko' if header is missing
    or contains an unsupported language.
    """
    header = request.headers.get("accept-language", DEFAULT_LANGUAGE)
    # Simple parsing: check if 'en' appears before 'ko' or is primary
    lang = header.split(",")[0].strip().lower()
    if lang.startswith("en"):
        return "en"
    return "ko"
