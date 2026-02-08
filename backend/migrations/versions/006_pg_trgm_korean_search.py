# @TASK P2-T2.6 - Add pg_trgm extension for Korean fuzzy search
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#search-engine

"""Add pg_trgm extension and GIN indexes for Korean text search.

Revision ID: 006_pg_trgm_korean_search
Revises: 005_device_code_oauth
Create Date: 2026-02-06 00:00:00.000000

pg_trgm (trigram) enables:
- Fuzzy matching with similarity search
- LIKE/ILIKE acceleration via GIN indexes
- Works well with Korean text (no morphological analysis needed)
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "006_pg_trgm_korean_search"
down_revision: Union[str, None] = "005_device_code_oauth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Enable pg_trgm extension and create GIN indexes for fuzzy search."""
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notes_title_trgm
        ON notes USING GIN (title gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_notes_content_text_trgm
        ON notes USING GIN (content_text gin_trgm_ops)
        """
    )


def downgrade() -> None:
    """Remove trigram indexes and extension."""
    op.execute("DROP INDEX IF EXISTS idx_notes_content_text_trgm")
    op.execute("DROP INDEX IF EXISTS idx_notes_title_trgm")
