"""Add note_images table for NSX image extraction.

Revision ID: 011_add_note_images
Revises: 010_add_clustering_tables
Create Date: 2026-02-09
"""

from alembic import op
import sqlalchemy as sa

revision = "011_add_note_images"
down_revision = "010_add_clustering_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    table_names = inspector.get_table_names()

    if "note_images" not in table_names:
        op.create_table(
            "note_images",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("synology_note_id", sa.String(length=100), nullable=False),
            sa.Column("ref", sa.String(length=255), nullable=False),
            sa.Column("md5", sa.String(length=32), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=True),
            sa.Column("file_path", sa.String(length=500), nullable=True),
            sa.Column("mime_type", sa.String(length=100), nullable=True),
            sa.Column("width", sa.Integer(), nullable=True),
            sa.Column("height", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("synology_note_id", "ref", name="uq_note_images_note_ref"),
        )
        op.create_index("idx_note_images_note_id", "note_images", ["synology_note_id"])
        op.create_index("idx_note_images_md5", "note_images", ["md5"])


def downgrade() -> None:
    op.drop_index("idx_note_images_md5", table_name="note_images")
    op.drop_index("idx_note_images_note_id", table_name="note_images")
    op.drop_table("note_images")
