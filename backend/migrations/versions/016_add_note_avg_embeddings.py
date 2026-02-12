"""Add materialized view for averaged note embeddings.

Revision ID: 016_add_note_avg_embeddings
Revises: 015_add_nas_link_fields
Create Date: 2026-02-11
"""

from alembic import op

revision = "016_add_note_avg_embeddings"
down_revision = "015_add_nas_link_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS note_avg_embeddings AS
        SELECT note_id, AVG(embedding)::vector(1536) AS avg_embedding
        FROM note_embeddings
        GROUP BY note_id
    """)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_note_id "
        "ON note_avg_embeddings (note_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_nav_embedding "
        "ON note_avg_embeddings USING ivfflat (avg_embedding vector_cosine_ops) "
        "WITH (lists = 50)"
    )


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS note_avg_embeddings")
