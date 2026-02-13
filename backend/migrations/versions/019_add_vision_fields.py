"""Add vision fields to note_images.

Revision ID: 019_add_vision_fields
Revises: 018_add_ocr_fields
Create Date: 2026-02-13
"""

import sqlalchemy as sa
from alembic import op

revision = "019_add_vision_fields"
down_revision = "018_add_ocr_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("note_images", sa.Column("vision_description", sa.Text(), nullable=True))
    op.add_column("note_images", sa.Column("vision_status", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("note_images", "vision_status")
    op.drop_column("note_images", "vision_description")
