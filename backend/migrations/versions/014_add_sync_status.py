"""Add sync_status, local_modified_at, remote_conflict_data to notes.

Revision ID: 014_add_sync_status
Revises: 013_add_activity_log
Create Date: 2026-02-11
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "014_add_sync_status"
down_revision = "013_add_activity_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("sync_status", sa.String(20), server_default="synced", nullable=False),
    )
    op.add_column(
        "notes",
        sa.Column("local_modified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "notes",
        sa.Column("remote_conflict_data", JSONB, nullable=True),
    )
    op.create_index("idx_notes_sync_status", "notes", ["sync_status"])


def downgrade() -> None:
    op.drop_index("idx_notes_sync_status", table_name="notes")
    op.drop_column("notes", "remote_conflict_data")
    op.drop_column("notes", "local_modified_at")
    op.drop_column("notes", "sync_status")
