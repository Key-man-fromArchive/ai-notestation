"""Combined simple + english tsvector for English stemming support.

Revision ID: 027_english_stemming
Revises: 026_restore_search_infra
Create Date: 2026-02-20

Problem: DB trigger uses to_tsvector('simple', ...) only — no stemming.
Searching "experiments" does NOT match "experiment" = silent failure.

Solution: Combined tsvector using both 'simple' (preserves Korean tokens)
and 'english' (adds English stems). Korean text passes through 'english'
config unchanged (verified). Index size ~50% larger (11MB→17MB, negligible).
"""

from alembic import op

revision = "027_english_stemming"
down_revision = "026_restore_search_infra"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Update trigger function: simple + english combined
    op.execute("""
        CREATE OR REPLACE FUNCTION update_search_vector()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
                setweight(to_tsvector('simple', coalesce(NEW.content_text, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.content_text, '')), 'B');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # 2. Backfill all existing notes with combined tsvector
    op.execute("""
        UPDATE notes SET
            search_vector =
                setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('simple', coalesce(content_text, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(content_text, '')), 'B')
    """)


def downgrade() -> None:
    # Revert to simple-only trigger
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

    # Revert all notes to simple-only tsvector
    op.execute("""
        UPDATE notes SET
            search_vector =
                setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('simple', coalesce(content_text, '')), 'B')
    """)
