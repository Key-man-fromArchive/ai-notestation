"""Add evaluation infrastructure tables: search_events, search_feedback, ai_feedback, evaluation_runs.

Revision ID: 024_add_evaluation_tables
Revises: 023_repair_notebook_data
Create Date: 2026-02-15
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "024_add_evaluation_tables"
down_revision = "023_repair_notebook_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- search_events: log every search query --
    op.create_table(
        "search_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("query", sa.String(length=500), nullable=False),
        sa.Column("search_type", sa.String(length=30), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("clicked_note_id", sa.String(length=255), nullable=True),
        sa.Column("judge_strategy", sa.String(length=50), nullable=True),
        sa.Column("details", JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_search_events_user_created", "search_events", ["user_id", "created_at"])
    op.create_index("idx_search_events_type_created", "search_events", ["search_type", "created_at"])

    # -- search_feedback: thumbs up/down per result --
    op.create_table(
        "search_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("search_event_id", sa.Integer(), nullable=False),
        sa.Column("note_id", sa.String(length=255), nullable=False),
        sa.Column("relevant", sa.Boolean(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["search_event_id"], ["search_events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("search_event_id", "note_id", "user_id", name="uq_search_feedback_event_note_user"),
        sa.PrimaryKeyConstraint("id"),
    )

    # -- ai_feedback: star rating on AI responses --
    op.create_table(
        "ai_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("feature", sa.String(length=50), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("model_used", sa.String(length=100), nullable=True),
        sa.Column("request_summary", sa.Text(), nullable=True),
        sa.Column("details", JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_ai_feedback_rating_range"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_feedback_feature", "ai_feedback", ["feature"])
    op.create_index("idx_ai_feedback_created", "ai_feedback", ["created_at"])

    # -- evaluation_runs: A/B test results --
    op.create_table(
        "evaluation_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("task_type", sa.String(length=30), nullable=False),
        sa.Column("models", JSONB(), nullable=False),
        sa.Column("test_count", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("results", JSONB(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("triggered_by", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("evaluation_runs")
    op.drop_index("idx_ai_feedback_created")
    op.drop_index("idx_ai_feedback_feature")
    op.drop_table("ai_feedback")
    op.drop_table("search_feedback")
    op.drop_index("idx_search_events_type_created")
    op.drop_index("idx_search_events_user_created")
    op.drop_table("search_events")
