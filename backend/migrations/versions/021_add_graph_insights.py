"""Add graph_insights table.

Revision ID: 021_add_graph_insights
Revises: 020_add_trash_operations
Create Date: 2026-02-14
"""

import sqlalchemy as sa
from alembic import op

revision = "021_add_graph_insights"
down_revision = "020_add_trash_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "graph_insights",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "org_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("hub_label", sa.String(500), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("notes", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("note_ids", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("chat_messages", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_graph_insights_user_id", "graph_insights", ["user_id"])
    op.create_index("idx_graph_insights_org_id", "graph_insights", ["org_id"])
    op.create_index(
        "idx_graph_insights_created_at", "graph_insights", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("idx_graph_insights_created_at", table_name="graph_insights")
    op.drop_index("idx_graph_insights_org_id", table_name="graph_insights")
    op.drop_index("idx_graph_insights_user_id", table_name="graph_insights")
    op.drop_table("graph_insights")
