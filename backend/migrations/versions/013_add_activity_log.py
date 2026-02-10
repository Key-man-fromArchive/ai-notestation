"""Add activity_logs table.

Revision ID: 013_add_activity_log
Revises: 012_add_missing_foreign_keys
Create Date: 2026-02-10
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "013_add_activity_log"
down_revision = "012_add_missing_foreign_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("operation", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("details", JSONB, nullable=True),
        sa.Column("triggered_by", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_activity_logs_operation", "activity_logs", ["operation"])
    op.create_index("ix_activity_logs_created_at", "activity_logs", ["created_at"])
    op.create_index("idx_activity_log_op_created", "activity_logs", ["operation", "created_at"])


def downgrade() -> None:
    op.drop_index("idx_activity_log_op_created", table_name="activity_logs")
    op.drop_index("ix_activity_logs_created_at", table_name="activity_logs")
    op.drop_index("ix_activity_logs_operation", table_name="activity_logs")
    op.drop_table("activity_logs")
