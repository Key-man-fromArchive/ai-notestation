from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_add_notebook_access"
down_revision: Union[str, None] = "008_add_share_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "notebook_access" not in table_names:
        op.create_table(
            "notebook_access",
            sa.Column("id", sa.Integer, nullable=False),
            sa.Column("notebook_id", sa.Integer, nullable=False),
            sa.Column("user_id", sa.Integer, nullable=True),
            sa.Column("org_id", sa.Integer, nullable=True),
            sa.Column("permission", sa.String(length=20), nullable=False, server_default="read"),
            sa.Column("granted_by", sa.Integer, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["notebook_id"], ["notebooks.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["granted_by"], ["users.id"], ondelete="SET NULL"),
            sa.CheckConstraint(
                "(user_id IS NOT NULL AND org_id IS NULL) OR (user_id IS NULL AND org_id IS NOT NULL)",
                name="ck_notebook_access_xor",
            ),
            sa.UniqueConstraint("notebook_id", "user_id", name="uq_notebook_access_user"),
            sa.UniqueConstraint("notebook_id", "org_id", name="uq_notebook_access_org"),
        )
        op.create_index("idx_notebook_access_notebook_id", "notebook_access", ["notebook_id"])
        op.create_index("idx_notebook_access_user_id", "notebook_access", ["user_id"])
        op.create_index("idx_notebook_access_org_id", "notebook_access", ["org_id"])


def downgrade() -> None:
    op.drop_index("idx_notebook_access_org_id", table_name="notebook_access")
    op.drop_index("idx_notebook_access_user_id", table_name="notebook_access")
    op.drop_index("idx_notebook_access_notebook_id", table_name="notebook_access")
    op.drop_table("notebook_access")
