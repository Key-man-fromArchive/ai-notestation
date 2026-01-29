# @TASK P0-T0.5 - Initial PostgreSQL schema with pgvector support
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#database-schema

"""Create initial schema with notes, embeddings, and settings tables.

Revision ID: 001_initial_schema
Revises: None
Create Date: 2026-01-29 08:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply schema migrations."""
    # Enable pgvector extension for embeddings
    op.execute('CREATE EXTENSION IF NOT EXISTS "vector"')

    # Create notes table
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer, nullable=False),
        sa.Column("synology_note_id", sa.String(255), nullable=False),
        sa.Column("title", sa.String(500), nullable=False, server_default=""),
        sa.Column("content_html", sa.Text, nullable=False, server_default=""),
        sa.Column("content_text", sa.Text, nullable=False, server_default=""),
        sa.Column("notebook_name", sa.String(255), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_todo", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_shortcut", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("source_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("search_vector", postgresql.TSVECTOR(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("synology_note_id"),
    )

    # Create indexes for notes table
    op.create_index("idx_notes_synology_note_id", "notes", ["synology_note_id"], unique=False)
    op.create_index(
        "idx_notes_search_vector",
        "notes",
        ["search_vector"],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index("idx_notes_notebook", "notes", ["notebook_name"], unique=False)
    op.create_index("idx_notes_synced_at", "notes", ["synced_at"], unique=False)

    # Create note_embeddings table
    op.create_table(
        "note_embeddings",
        sa.Column("id", sa.Integer, nullable=False),
        sa.Column("note_id", sa.Integer, nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False, server_default="0"),
        sa.Column("chunk_text", sa.Text, nullable=False),
        sa.Column(
            "embedding",
            postgresql.Vector(dim=1536),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for note_embeddings table
    op.create_index("idx_embeddings_note_id", "note_embeddings", ["note_id"], unique=False)
    # Create IVFFlat vector index for approximate nearest neighbor search
    op.execute(
        "CREATE INDEX idx_embeddings_vector ON note_embeddings "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )

    # Create settings table
    op.create_table(
        "settings",
        sa.Column("id", sa.Integer, nullable=False),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="'{}'"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )

    # Create indexes for settings table
    op.create_index("idx_settings_key", "settings", ["key"], unique=False)

    # Create trigger function to automatically update search_vector on notes
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_search_vector()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
                setweight(to_tsvector('simple', coalesce(NEW.content_text, '')), 'B');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """
    )

    # Create trigger for notes table
    op.execute(
        """
        CREATE TRIGGER trigger_update_search_vector
            BEFORE INSERT OR UPDATE ON notes
            FOR EACH ROW
            EXECUTE FUNCTION update_search_vector();
    """
    )


def downgrade() -> None:
    """Revert schema migrations."""
    # Drop trigger and function
    op.execute("DROP TRIGGER IF EXISTS trigger_update_search_vector ON notes")
    op.execute("DROP FUNCTION IF EXISTS update_search_vector()")

    # Drop settings table
    op.drop_index("idx_settings_key", table_name="settings")
    op.drop_table("settings")

    # Drop note_embeddings table
    op.drop_index("idx_embeddings_vector", table_name="note_embeddings")
    op.drop_index("idx_embeddings_note_id", table_name="note_embeddings")
    op.drop_table("note_embeddings")

    # Drop notes table
    op.drop_index("idx_notes_synced_at", table_name="notes")
    op.drop_index("idx_notes_notebook", table_name="notes")
    op.drop_index("idx_notes_search_vector", table_name="notes")
    op.drop_index("idx_notes_synology_note_id", table_name="notes")
    op.drop_table("notes")

    # Drop pgvector extension
    op.execute('DROP EXTENSION IF EXISTS "vector"')
