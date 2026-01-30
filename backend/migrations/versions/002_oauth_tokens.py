"""Add oauth_tokens table.

Revision ID: 002_oauth_tokens
Revises: 001_initial_schema
Create Date: 2026-01-30 08:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_oauth_tokens"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "oauth_tokens",
        sa.Column("id", sa.Integer, nullable=False),
        sa.Column("username", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("access_token_encrypted", sa.Text, nullable=False),
        sa.Column("refresh_token_encrypted", sa.Text, nullable=True),
        sa.Column("token_type", sa.String(50), nullable=False, server_default="bearer"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scope", sa.String(1024), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("pkce_state", sa.String(128), nullable=True),
        sa.Column("pkce_code_verifier", sa.String(128), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", "provider", name="uq_oauth_tokens_user_provider"),
    )
    op.create_index("idx_oauth_tokens_username", "oauth_tokens", ["username"])
    op.create_index("idx_oauth_tokens_provider", "oauth_tokens", ["provider"])


def downgrade() -> None:
    op.drop_index("idx_oauth_tokens_provider", table_name="oauth_tokens")
    op.drop_index("idx_oauth_tokens_username", table_name="oauth_tokens")
    op.drop_table("oauth_tokens")
