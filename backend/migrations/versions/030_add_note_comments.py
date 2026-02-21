"""Add note_comments table for inline comment threads.

Revision ID: 030_add_note_comments
Revises: 029_add_note_summary
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "030_add_note_comments"
down_revision = "029_add_note_summary"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "note_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("comment_id", sa.String(36), unique=True, nullable=False),
        sa.Column("note_id", sa.Integer(), sa.ForeignKey("notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_name", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_resolved", sa.Boolean(), server_default="false"),
        sa.Column("resolved_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_note_comments_note_id", "note_comments", ["note_id"])


def downgrade() -> None:
    op.drop_index("idx_note_comments_note_id")
    op.drop_table("note_comments")
