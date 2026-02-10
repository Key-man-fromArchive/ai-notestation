# @TASK T1.1 - Add missing FK constraints across 9 tables
# @SPEC docs/planning/02-trd.md#database-integrity

"""Add missing foreign key constraints across 9 tables.

Adds 16 FK constraints to: memberships, note_access, notes, note_embeddings,
note_attachments, share_links, clustering_tasks, note_clusters.
Also makes note_access.granted_by nullable (SET NULL on user delete).

notebook_access already has FKs from migration 009 -- not touched here.

Revision ID: 012_add_missing_foreign_keys
Revises: 011_add_note_images
Create Date: 2026-02-10
"""

from alembic import op
import sqlalchemy as sa

revision = "012_add_missing_foreign_keys"
down_revision = "011_add_note_images"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- note_access.granted_by: NOT NULL -> nullable for SET NULL FK ---
    op.alter_column(
        "note_access",
        "granted_by",
        existing_type=sa.Integer(),
        nullable=True,
    )

    # --- memberships ---
    op.create_foreign_key(
        "fk_memberships_user_id",
        "memberships", "users",
        ["user_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_memberships_org_id",
        "memberships", "organizations",
        ["org_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_memberships_invited_by",
        "memberships", "users",
        ["invited_by"], ["id"],
        ondelete="SET NULL",
    )

    # --- note_access ---
    op.create_foreign_key(
        "fk_note_access_note_id",
        "note_access", "notes",
        ["note_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_note_access_user_id",
        "note_access", "users",
        ["user_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_note_access_org_id",
        "note_access", "organizations",
        ["org_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_note_access_granted_by",
        "note_access", "users",
        ["granted_by"], ["id"],
        ondelete="SET NULL",
    )

    # --- notes ---
    op.create_foreign_key(
        "fk_notes_notebook_id",
        "notes", "notebooks",
        ["notebook_id"], ["id"],
        ondelete="SET NULL",
    )

    # --- note_embeddings ---
    op.create_foreign_key(
        "fk_note_embeddings_note_id",
        "note_embeddings", "notes",
        ["note_id"], ["id"],
        ondelete="CASCADE",
    )

    # --- note_attachments ---
    op.create_foreign_key(
        "fk_note_attachments_note_id",
        "note_attachments", "notes",
        ["note_id"], ["id"],
        ondelete="CASCADE",
    )

    # --- share_links ---
    op.create_foreign_key(
        "fk_share_links_notebook_id",
        "share_links", "notebooks",
        ["notebook_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_share_links_note_id",
        "share_links", "notes",
        ["note_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_share_links_created_by",
        "share_links", "users",
        ["created_by"], ["id"],
        ondelete="CASCADE",
    )

    # --- clustering_tasks ---
    op.create_foreign_key(
        "fk_clustering_tasks_created_by",
        "clustering_tasks", "users",
        ["created_by"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_clustering_tasks_notebook_id",
        "clustering_tasks", "notebooks",
        ["notebook_id"], ["id"],
        ondelete="CASCADE",
    )

    # --- note_clusters ---
    op.create_foreign_key(
        "fk_note_clusters_notebook_id",
        "note_clusters", "notebooks",
        ["notebook_id"], ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    # --- note_clusters ---
    op.drop_constraint("fk_note_clusters_notebook_id", "note_clusters", type_="foreignkey")

    # --- clustering_tasks ---
    op.drop_constraint("fk_clustering_tasks_notebook_id", "clustering_tasks", type_="foreignkey")
    op.drop_constraint("fk_clustering_tasks_created_by", "clustering_tasks", type_="foreignkey")

    # --- share_links ---
    op.drop_constraint("fk_share_links_created_by", "share_links", type_="foreignkey")
    op.drop_constraint("fk_share_links_note_id", "share_links", type_="foreignkey")
    op.drop_constraint("fk_share_links_notebook_id", "share_links", type_="foreignkey")

    # --- note_attachments ---
    op.drop_constraint("fk_note_attachments_note_id", "note_attachments", type_="foreignkey")

    # --- note_embeddings ---
    op.drop_constraint("fk_note_embeddings_note_id", "note_embeddings", type_="foreignkey")

    # --- notes ---
    op.drop_constraint("fk_notes_notebook_id", "notes", type_="foreignkey")

    # --- note_access ---
    op.drop_constraint("fk_note_access_granted_by", "note_access", type_="foreignkey")
    op.drop_constraint("fk_note_access_org_id", "note_access", type_="foreignkey")
    op.drop_constraint("fk_note_access_user_id", "note_access", type_="foreignkey")
    op.drop_constraint("fk_note_access_note_id", "note_access", type_="foreignkey")

    # --- memberships ---
    op.drop_constraint("fk_memberships_invited_by", "memberships", type_="foreignkey")
    op.drop_constraint("fk_memberships_org_id", "memberships", type_="foreignkey")
    op.drop_constraint("fk_memberships_user_id", "memberships", type_="foreignkey")

    # --- Revert note_access.granted_by to NOT NULL ---
    op.alter_column(
        "note_access",
        "granted_by",
        existing_type=sa.Integer(),
        nullable=False,
    )
