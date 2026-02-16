"""Add member groups infrastructure for bulk permission management.

Revision ID: 025_add_member_groups
Revises: 024_add_evaluation_tables
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa

revision = "025_add_member_groups"
down_revision = "024_add_evaluation_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- member_groups: organize members for bulk operations --
    op.create_table(
        "member_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("color", sa.String(length=20), nullable=False, server_default="#6B7280"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "name", name="uq_member_group_org_name"),
    )
    op.create_index("idx_member_group_org_id", "member_groups", ["org_id"])

    # -- member_group_memberships: map members to groups --
    op.create_table(
        "member_group_memberships",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("membership_id", sa.Integer(), nullable=False),
        sa.Column("added_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["added_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["group_id"], ["member_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["membership_id"], ["memberships.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "membership_id", name="uq_group_membership"),
    )
    op.create_index("idx_group_membership_group_id", "member_group_memberships", ["group_id"])
    op.create_index("idx_group_membership_membership_id", "member_group_memberships", ["membership_id"])

    # -- group_notebook_access: bulk notebook permissions --
    op.create_table(
        "group_notebook_access",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("notebook_id", sa.Integer(), nullable=False),
        sa.Column("permission", sa.String(length=20), nullable=False, server_default="read"),
        sa.Column("granted_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["granted_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["group_id"], ["member_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["notebook_id"], ["notebooks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "notebook_id", name="uq_group_notebook_access"),
    )
    op.create_index("idx_group_notebook_access_group_id", "group_notebook_access", ["group_id"])
    op.create_index("idx_group_notebook_access_notebook_id", "group_notebook_access", ["notebook_id"])


def downgrade() -> None:
    op.drop_index("idx_group_notebook_access_notebook_id", table_name="group_notebook_access")
    op.drop_index("idx_group_notebook_access_group_id", table_name="group_notebook_access")
    op.drop_table("group_notebook_access")
    op.drop_index("idx_group_membership_membership_id", table_name="member_group_memberships")
    op.drop_index("idx_group_membership_group_id", table_name="member_group_memberships")
    op.drop_table("member_group_memberships")
    op.drop_index("idx_member_group_org_id", table_name="member_groups")
    op.drop_table("member_groups")
