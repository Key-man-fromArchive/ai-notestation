"""Auto-tagging service for generating AI tags on notes.

Uses the existing summarize prompt and AIRouter to generate tags
for individual notes or batch-process untagged notes.
"""

from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_router.prompts.summarize import build_messages
from app.ai_router.router import AIRouter
from app.ai_router.schemas import AIRequest
from app.models import Note

logger = logging.getLogger(__name__)


class AutoTagger:
    """Generates AI tags for notes using the summarize prompt."""

    def __init__(self, router: AIRouter | None = None) -> None:
        self._router = router or AIRouter()

    async def generate_tags(
        self, title: str, content: str, lang: str = "ko"
    ) -> list[str]:
        """Generate tags for a note using the summarize prompt.

        Args:
            title: Note title.
            content: Plaintext note content.
            lang: Language for prompts ("ko" or "en").

        Returns:
            List of generated tag strings. Empty list on failure.
        """
        note_text = f"{title}\n\n{content}" if len(content) >= 50 else title
        if not note_text.strip():
            return []

        try:
            messages = build_messages(note_text, lang=lang)
            request = AIRequest(
                messages=messages,
                temperature=0.3,
                max_tokens=512,
            )
            response = await self._router.chat(request)
            return self._parse_tags(response.content)
        except Exception:
            logger.exception("Failed to generate tags")
            return []

    async def tag_note(
        self, note_id: int, db: AsyncSession, lang: str = "ko"
    ) -> list[str]:
        """Generate tags for a single note and update the database.

        Args:
            note_id: Database primary key of the note.
            db: Active async database session.
            lang: Language for prompts.

        Returns:
            The final merged list of tags on the note.
        """
        result = await db.execute(select(Note).where(Note.id == note_id))
        note = result.scalar_one_or_none()
        if not note:
            return []

        new_tags = await self.generate_tags(
            title=note.title or "",
            content=note.content_text or "",
            lang=lang,
        )
        if not new_tags:
            return list(note.tags or [])

        existing = list(note.tags or [])
        merged = list(dict.fromkeys(existing + new_tags))  # preserve order, dedupe
        note.tags = merged
        await db.flush()
        return merged

    @staticmethod
    def _parse_tags(content: str) -> list[str]:
        """Extract tags list from AI JSON response."""
        try:
            data = json.loads(content.strip())
            tags = data.get("tags", [])
            if isinstance(tags, list):
                return [str(t).strip() for t in tags if str(t).strip()]
        except (json.JSONDecodeError, AttributeError):
            logger.warning("Failed to parse tags from AI response: %s", content[:200])
        return []
