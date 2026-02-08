from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_add_share_links"
down_revision: Union[str, None] = "007_add_notebooks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "share_links" not in table_names:
        op.create_table(
            "share_links",
            sa.Column("id", sa.Integer, nullable=False),
            sa.Column("token", sa.String(length=64), nullable=False),
            sa.Column("notebook_id", sa.Integer, nullable=True),
            sa.Column("note_id", sa.Integer, nullable=True),
            sa.Column("link_type", sa.String(length=20), nullable=False),
            sa.Column("created_by", sa.Integer, nullable=False),
            sa.Column("email_restriction", sa.String(length=255), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("access_count", sa.Integer, nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
            sa.CheckConstraint("(note_id IS NOT NULL) OR (notebook_id IS NOT NULL)", name="ck_sharelink_has_target"),
        )
        op.create_index("ix_share_links_token", "share_links", ["token"], unique=True)
        op.create_index("idx_share_links_token", "share_links", ["token"])


def downgrade() -> None:
    op.drop_index("idx_share_links_token", table_name="share_links")
    op.drop_index("ix_share_links_token", table_name="share_links")
    op.drop_table("share_links")
