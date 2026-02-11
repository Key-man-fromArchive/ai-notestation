"""Add link_id and nas_ver to notes for NAS image proxy.

Revision ID: 015_add_nas_link_fields
Revises: 014_add_sync_status
Create Date: 2026-02-11
"""

import sqlalchemy as sa
from alembic import op

revision = "015_add_nas_link_fields"
down_revision = "014_add_sync_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("link_id", sa.String(), nullable=True))
    op.add_column("notes", sa.Column("nas_ver", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("notes", "nas_ver")
    op.drop_column("notes", "link_id")
