from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "010_add_clustering_tables"
down_revision: Union[str, None] = "009_add_notebook_access"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "clustering_tasks" not in table_names:
        op.create_table(
            "clustering_tasks",
            sa.Column("id", sa.Integer, nullable=False),
            sa.Column("task_id", sa.String(length=64), nullable=False),
            sa.Column("notebook_id", sa.Integer, nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("num_clusters", sa.Integer, nullable=False, server_default="5"),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("created_by", sa.Integer, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_clustering_tasks_task_id", "clustering_tasks", ["task_id"], unique=True)
        op.create_index("idx_clustering_tasks_task_id", "clustering_tasks", ["task_id"])
        op.create_index("idx_clustering_tasks_notebook_id", "clustering_tasks", ["notebook_id"])

    if "note_clusters" not in table_names:
        op.create_table(
            "note_clusters",
            sa.Column("id", sa.Integer, nullable=False),
            sa.Column("task_id", sa.String(length=64), nullable=False),
            sa.Column("notebook_id", sa.Integer, nullable=False),
            sa.Column("cluster_index", sa.Integer, nullable=False),
            sa.Column("note_ids", JSONB, nullable=False),
            sa.Column("summary", sa.Text, nullable=False, server_default=""),
            sa.Column("keywords", JSONB, nullable=True),
            sa.Column("centroid", JSONB, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("idx_note_clusters_task_id", "note_clusters", ["task_id"])
        op.create_index("idx_note_clusters_notebook_id", "note_clusters", ["notebook_id"])


def downgrade() -> None:
    op.drop_index("idx_note_clusters_notebook_id", table_name="note_clusters")
    op.drop_index("idx_note_clusters_task_id", table_name="note_clusters")
    op.drop_table("note_clusters")

    op.drop_index("idx_clustering_tasks_notebook_id", table_name="clustering_tasks")
    op.drop_index("idx_clustering_tasks_task_id", table_name="clustering_tasks")
    op.drop_index("ix_clustering_tasks_task_id", table_name="clustering_tasks")
    op.drop_table("clustering_tasks")
