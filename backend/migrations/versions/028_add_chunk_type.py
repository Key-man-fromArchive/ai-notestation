"""Add chunk_type column to note_embeddings.

Revision ID: 028_add_chunk_type
Revises: 027_english_stemming
Create Date: 2026-02-20

Tracks source type per chunk (content/pdf/hwp/docx/ocr/vision/summary)
for per-source filtering and "why matched" display in search results.
"""

from alembic import op
import sqlalchemy as sa

revision = "028_add_chunk_type"
down_revision = "027_english_stemming"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "note_embeddings",
        sa.Column("chunk_type", sa.String(20), server_default="content", nullable=False),
    )
    op.create_index("idx_embeddings_chunk_type", "note_embeddings", ["chunk_type"])


def downgrade() -> None:
    op.drop_index("idx_embeddings_chunk_type", table_name="note_embeddings")
    op.drop_column("note_embeddings", "chunk_type")
