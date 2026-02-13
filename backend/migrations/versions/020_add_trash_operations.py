"""Add trash_operations table.

Revision ID: 020_add_trash_operations
Revises: 019_add_vision_fields
Create Date: 2026-02-13
"""

import sqlalchemy as sa
from alembic import op

revision = "020_add_trash_operations"
down_revision = "019_add_vision_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trash_operations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("operation_type", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("item_count", sa.Integer(), server_default="0"),
        sa.Column("size_bytes", sa.BigInteger(), server_default="0"),
        sa.Column("backup_path", sa.String(500), nullable=False),
        sa.Column("manifest", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("triggered_by", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("restored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("purged_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_trash_operations_status",
        "trash_operations",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("idx_trash_operations_status", table_name="trash_operations")
    op.drop_table("trash_operations")
