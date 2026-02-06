"""
Revision ID: 003_note_attachments_content_json
Revises: 002_oauth_tokens
Create Date: 2026-02-04 10:12:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003_note_attach_json"
down_revision: Union[str, None] = "002_oauth_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    note_columns = {col["name"] for col in inspector.get_columns("notes")}
    if "content_json" not in note_columns:
        op.add_column(
            "notes",
            sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        )

    table_names = set(inspector.get_table_names())
    if "note_attachments" not in table_names:
        op.create_table(
            "note_attachments",
            sa.Column("id", sa.Integer, nullable=False),
            sa.Column("note_id", sa.Integer, nullable=False),
            sa.Column("file_id", sa.String(length=255), nullable=False),
            sa.Column("name", sa.String(length=512), nullable=False),
            sa.Column("mime_type", sa.String(length=100), nullable=True),
            sa.Column("size", sa.Integer, nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.PrimaryKeyConstraint("id"),
        )

    index_names = {idx["name"] for idx in inspector.get_indexes("note_attachments")}
    if "idx_note_attachments_note_id" not in index_names:
        op.create_index("idx_note_attachments_note_id", "note_attachments", ["note_id"])


def downgrade() -> None:
    op.drop_index("idx_note_attachments_note_id", table_name="note_attachments")
    op.drop_table("note_attachments")
    op.drop_column("notes", "content_json")
