"""Add OCR fields to note_images.

Revision ID: 018_add_ocr_fields
Revises: 017_add_pdf_extraction_fields
Create Date: 2026-02-13
"""

import sqlalchemy as sa
from alembic import op

revision = "018_add_ocr_fields"
down_revision = "017_add_pdf_extraction_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("note_images", sa.Column("extracted_text", sa.Text(), nullable=True))
    op.add_column("note_images", sa.Column("extraction_status", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("note_images", "extraction_status")
    op.drop_column("note_images", "extracted_text")
