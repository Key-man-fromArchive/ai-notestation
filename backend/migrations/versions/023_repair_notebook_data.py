"""Repair notebook data: delete dummies, create real notebooks from notes, link FK.

Revision ID: 023_repair_notebook_data
Revises: 022_notebook_sync_fields
Create Date: 2026-02-15
"""

from alembic import op

revision = "023_repair_notebook_data"
down_revision = "022_notebook_sync_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Delete notebook_access for dummy notebooks that don't match any note's notebook_name
    op.execute("""
        DELETE FROM notebook_access
        WHERE notebook_id IN (
            SELECT nb.id FROM notebooks nb
            WHERE NOT EXISTS (
                SELECT 1 FROM notes n WHERE n.notebook_name = nb.name
            )
        )
    """)

    # 2. Delete dummy notebooks that don't match any note's notebook_name
    op.execute("""
        DELETE FROM notebooks
        WHERE NOT EXISTS (
            SELECT 1 FROM notes n WHERE n.notebook_name = notebooks.name
        )
    """)

    # 3. Insert real notebooks from distinct notes.notebook_name (skip existing)
    op.execute("""
        INSERT INTO notebooks (name)
        SELECT DISTINCT n.notebook_name
        FROM notes n
        WHERE n.notebook_name IS NOT NULL
          AND n.notebook_name != ''
          AND NOT EXISTS (
              SELECT 1 FROM notebooks nb WHERE nb.name = n.notebook_name
          )
    """)

    # 4. Ensure "Uncategorized" notebook exists
    op.execute("""
        INSERT INTO notebooks (name)
        SELECT 'Uncategorized'
        WHERE NOT EXISTS (
            SELECT 1 FROM notebooks WHERE name = 'Uncategorized'
        )
    """)

    # 5. Link notes.notebook_id to matching notebooks.id
    op.execute("""
        UPDATE notes
        SET notebook_id = nb.id
        FROM notebooks nb
        WHERE notes.notebook_name = nb.name
          AND notes.notebook_name IS NOT NULL
          AND notes.notebook_name != ''
    """)

    # 6. Link notes with NULL/empty notebook_name to "Uncategorized"
    op.execute("""
        UPDATE notes
        SET notebook_id = (SELECT id FROM notebooks WHERE name = 'Uncategorized' LIMIT 1)
        WHERE (notebook_name IS NULL OR notebook_name = '')
          AND notebook_id IS NULL
    """)


def downgrade() -> None:
    # Clear notebook_id FK (reversible)
    op.execute("UPDATE notes SET notebook_id = NULL")
