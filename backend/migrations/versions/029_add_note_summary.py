"""Add summary column to notes for AI-generated note summaries.

Revision ID: 029_add_note_summary
Revises: 028_add_chunk_type
Create Date: 2026-02-20

Stores AI-generated 2-3 sentence summaries per note. The summary is
embedded as a special chunk (chunk_type='summary', chunk_index=-1)
to improve recall for question-type queries.
"""

from alembic import op
import sqlalchemy as sa

revision = "029_add_note_summary"
down_revision = "028_add_chunk_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("summary", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("notes", "summary")
