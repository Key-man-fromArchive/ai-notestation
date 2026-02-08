# @TASK P2-T2.7 - Add notebooks table and migrate from notebook_name
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#database-schema

"""Add notebooks table and migrate existing notebook_name data.

Revision ID: 007_add_notebooks
Revises: 006_pg_trgm_korean_search
Create Date: 2026-02-07 00:00:00.000000

This migration:
1. Creates notebooks table with org-level scoping
2. Migrates existing notebook_name values from notes table
3. Creates "Uncategorized" notebook for NULL notebook_name
4. Adds notebook_id FK to notes table
5. Keeps notebook_name for backward compatibility
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "007_add_notebooks"
down_revision: str | None = "006_pg_trgm_korean_search"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create notebooks table and migrate data from notes.notebook_name."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    # 1. Create notebooks table
    if "notebooks" not in table_names:
        op.create_table(
            "notebooks",
            sa.Column("id", sa.Integer, nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("owner_id", sa.Integer, nullable=True),
            sa.Column("org_id", sa.Integer, nullable=True),
            sa.Column("is_public", sa.Boolean, nullable=False, server_default=sa.text("false")),
            sa.Column("public_links_enabled", sa.Boolean, nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
                onupdate=sa.func.now(),
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("org_id", "name", name="uq_notebooks_org_name"),
        )
        op.create_index("idx_notebooks_owner_id", "notebooks", ["owner_id"])
        op.create_index("idx_notebooks_org_id", "notebooks", ["org_id"])

    # 2. Migrate existing notebook_name data
    # Get distinct notebook names from notes (excluding NULL)
    result = bind.execute(
        sa.text(
            """
            SELECT DISTINCT notebook_name
            FROM notes
            WHERE notebook_name IS NOT NULL
            ORDER BY notebook_name
            """
        )
    )
    existing_notebooks = [row[0] for row in result]

    # Insert notebooks with NULL org_id (system notebooks)
    for notebook_name in existing_notebooks:
        bind.execute(
            sa.text(
                """
                INSERT INTO notebooks (name, org_id, owner_id, is_public, public_links_enabled)
                VALUES (:name, NULL, NULL, false, false)
                ON CONFLICT (org_id, name) DO NOTHING
                """
            ),
            {"name": notebook_name},
        )

    # Create "Uncategorized" notebook for NULL notebook_name
    bind.execute(
        sa.text(
            """
            INSERT INTO notebooks (name, org_id, owner_id, is_public, public_links_enabled)
            VALUES ('Uncategorized', NULL, NULL, false, false)
            ON CONFLICT (org_id, name) DO NOTHING
            """
        )
    )

    # 3. Add notebook_id column to notes table
    op.add_column("notes", sa.Column("notebook_id", sa.Integer, nullable=True))
    op.create_index("idx_notes_notebook_id", "notes", ["notebook_id"])

    # 4. Update notes.notebook_id from notebooks.name
    # For notes with notebook_name
    bind.execute(
        sa.text(
            """
            UPDATE notes
            SET notebook_id = notebooks.id
            FROM notebooks
            WHERE notes.notebook_name = notebooks.name
            AND notebooks.org_id IS NULL
            """
        )
    )

    # For notes with NULL notebook_name → set to "Uncategorized"
    bind.execute(
        sa.text(
            """
            UPDATE notes
            SET notebook_id = notebooks.id
            FROM notebooks
            WHERE notes.notebook_name IS NULL
            AND notebooks.name = 'Uncategorized'
            AND notebooks.org_id IS NULL
            """
        )
    )


def downgrade() -> None:
    """Remove notebook_id column and notebooks table."""
    op.drop_index("idx_notes_notebook_id", table_name="notes")
    op.drop_column("notes", "notebook_id")

    op.drop_index("idx_notebooks_org_id", table_name="notebooks")
    op.drop_index("idx_notebooks_owner_id", table_name="notebooks")
    op.drop_table("notebooks")
