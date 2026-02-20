"""Restore search infrastructure: tsvector trigger, search_vector backfill, trigram indexes.

Revision ID: 026_restore_search_infra
Revises: 025_add_member_groups
Create Date: 2026-02-20

Root cause: DB trigger `update_search_vector` and trigram GIN indexes were
missing from the live database, causing ALL 2,260 notes to have NULL
search_vector. FTS and Trigram engines returned 0 results for every query.

This migration:
1. Recreates the trigger function + trigger (from 001_initial_schema)
2. Backfills search_vector for all existing notes
3. Recreates trigram GIN indexes (from 006_pg_trgm_korean_search)
"""

from alembic import op

revision = "026_restore_search_infra"
down_revision = "025_add_member_groups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Ensure pg_trgm extension exists
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')

    # 2. Recreate trigger function
    op.execute("""
        CREATE OR REPLACE FUNCTION update_search_vector()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
                setweight(to_tsvector('simple', coalesce(NEW.content_text, '')), 'B');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # 3. Recreate trigger (drop first to be idempotent)
    op.execute("DROP TRIGGER IF EXISTS trigger_update_search_vector ON notes")
    op.execute("""
        CREATE TRIGGER trigger_update_search_vector
            BEFORE INSERT OR UPDATE ON notes
            FOR EACH ROW
            EXECUTE FUNCTION update_search_vector();
    """)

    # 4. Backfill search_vector for all existing notes
    op.execute("""
        UPDATE notes SET
            search_vector =
                setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('simple', coalesce(content_text, '')), 'B')
        WHERE search_vector IS NULL
    """)

    # 5. Recreate trigram GIN indexes for fuzzy search
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_notes_title_trgm
        ON notes USING GIN (title gin_trgm_ops)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_notes_content_text_trgm
        ON notes USING GIN (content_text gin_trgm_ops)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_notes_content_text_trgm")
    op.execute("DROP INDEX IF EXISTS idx_notes_title_trgm")
    op.execute("DROP TRIGGER IF EXISTS trigger_update_search_vector ON notes")
    op.execute("DROP FUNCTION IF EXISTS update_search_vector()")
