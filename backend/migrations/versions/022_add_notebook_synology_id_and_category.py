"""Add synology_id and category columns to notebooks table.

Revision ID: 022_notebook_sync_fields
Revises: 021_add_graph_insights
Create Date: 2026-02-15
"""

import sqlalchemy as sa
from alembic import op

revision = "022_notebook_sync_fields"
down_revision = "021_add_graph_insights"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notebooks", sa.Column("synology_id", sa.String(255), nullable=True))
    op.add_column("notebooks", sa.Column("category", sa.String(50), nullable=True))
    op.create_index("idx_notebooks_synology_id", "notebooks", ["synology_id"])
    op.create_index("idx_notebooks_category", "notebooks", ["category"])
    op.create_unique_constraint(
        "uq_notebooks_org_synology_id", "notebooks", ["org_id", "synology_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_notebooks_org_synology_id", "notebooks", type_="unique")
    op.drop_index("idx_notebooks_category", table_name="notebooks")
    op.drop_index("idx_notebooks_synology_id", table_name="notebooks")
    op.drop_column("notebooks", "category")
    op.drop_column("notebooks", "synology_id")
