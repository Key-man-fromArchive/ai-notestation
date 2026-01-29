# @TASK P3-T3.7 - AI Prompt Templates package
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""AI prompt templates for LabNote AI features.

Provides pre-built prompt templates for five core AI features:
- insight: Insight extraction from research notes
- search_qa: RAG-based question answering over notes
- writing: Research note writing assistance
- spellcheck: Korean/English spelling and grammar correction
- template: Research note template generation
"""

from app.ai_router.prompts import insight, search_qa, spellcheck, template, writing

__all__ = [
    "insight",
    "search_qa",
    "writing",
    "spellcheck",
    "template",
]
