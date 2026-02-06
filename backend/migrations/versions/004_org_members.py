from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_org_members"
down_revision: Union[str, None] = "003_note_attach_json"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "organizations" not in table_names:
        op.create_table(
            "organizations",
            sa.Column("id", sa.Integer, nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("slug", sa.String(length=100), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
                onupdate=sa.func.now(),
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)

    if "users" not in table_names:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer, nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
            sa.Column("email_verified", sa.Boolean, nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
                onupdate=sa.func.now(),
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    if "memberships" not in table_names:
        op.create_table(
            "memberships",
            sa.Column("id", sa.Integer, nullable=False),
            sa.Column("user_id", sa.Integer, nullable=False),
            sa.Column("org_id", sa.Integer, nullable=False),
            sa.Column("role", sa.String(length=20), nullable=False, server_default="member"),
            sa.Column("invited_by", sa.Integer, nullable=True),
            sa.Column("invite_token", sa.String(length=128), nullable=True),
            sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "org_id", name="uq_memberships_user_org"),
        )
        op.create_index("idx_memberships_user_id", "memberships", ["user_id"])
        op.create_index("idx_memberships_org_id", "memberships", ["org_id"])
        op.create_index("idx_memberships_invite_token", "memberships", ["invite_token"])

    if "note_access" not in table_names:
        op.create_table(
            "note_access",
            sa.Column("id", sa.Integer, nullable=False),
            sa.Column("note_id", sa.Integer, nullable=False),
            sa.Column("user_id", sa.Integer, nullable=True),
            sa.Column("org_id", sa.Integer, nullable=True),
            sa.Column("permission", sa.String(length=20), nullable=False, server_default="read"),
            sa.Column("granted_by", sa.Integer, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("idx_note_access_note_id", "note_access", ["note_id"])
        op.create_index("idx_note_access_user_id", "note_access", ["user_id"])
        op.create_index("idx_note_access_org_id", "note_access", ["org_id"])


def downgrade() -> None:
    op.drop_index("idx_note_access_org_id", table_name="note_access")
    op.drop_index("idx_note_access_user_id", table_name="note_access")
    op.drop_index("idx_note_access_note_id", table_name="note_access")
    op.drop_table("note_access")

    op.drop_index("idx_memberships_invite_token", table_name="memberships")
    op.drop_index("idx_memberships_org_id", table_name="memberships")
    op.drop_index("idx_memberships_user_id", table_name="memberships")
    op.drop_table("memberships")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    op.drop_index("ix_organizations_slug", table_name="organizations")
    op.drop_table("organizations")
