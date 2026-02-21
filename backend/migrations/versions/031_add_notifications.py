"""Add notifications table for comment and mention alerts.

Revision ID: 031_add_notifications
Revises: 030_add_note_comments
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "031_add_notifications"
down_revision = "030_add_note_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notification_type", sa.String(50), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_name", sa.String(255), nullable=False),
        sa.Column("note_id", sa.Integer(), sa.ForeignKey("notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("note_title", sa.String(500), nullable=False),
        sa.Column("synology_note_id", sa.String(255), nullable=False),
        sa.Column("comment_id", sa.String(36), nullable=True),
        sa.Column("is_read", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_notifications_user_id", "notifications", ["user_id"])
    op.create_index("idx_notifications_user_read", "notifications", ["user_id", "is_read"])


def downgrade() -> None:
    op.drop_index("idx_notifications_user_read")
    op.drop_index("idx_notifications_user_id")
    op.drop_table("notifications")
