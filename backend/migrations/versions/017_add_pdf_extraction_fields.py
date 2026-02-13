"""Add PDF extraction fields to note_attachments.

Revision ID: 017_add_pdf_extraction_fields
Revises: 016_add_note_avg_embeddings
Create Date: 2026-02-13
"""

import sqlalchemy as sa
from alembic import op

revision = "017_add_pdf_extraction_fields"
down_revision = "016_add_note_avg_embeddings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("note_attachments", sa.Column("extracted_text", sa.Text(), nullable=True))
    op.add_column("note_attachments", sa.Column("extraction_status", sa.String(20), nullable=True))
    op.add_column("note_attachments", sa.Column("page_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("note_attachments", "page_count")
    op.drop_column("note_attachments", "extraction_status")
    op.drop_column("note_attachments", "extracted_text")
