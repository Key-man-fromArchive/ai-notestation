# @TASK P3-T3.1 - AI Router package
# @TASK P3-T3.6 - AIRouter unified interface export
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""AI Router - Unified interface for multiple AI providers."""

from app.ai_router import prompts  # noqa: F401
from app.ai_router.router import AIRouter

__all__ = ["AIRouter"]
