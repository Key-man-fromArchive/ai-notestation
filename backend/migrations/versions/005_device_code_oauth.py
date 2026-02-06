from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_device_code_oauth"
down_revision: Union[str, None] = "004_org_members"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = {col["name"] for col in inspector.get_columns("oauth_tokens")}

    if "device_code" not in columns:
        op.add_column("oauth_tokens", sa.Column("device_code", sa.String(512), nullable=True))

    if "device_code_expires_at" not in columns:
        op.add_column(
            "oauth_tokens",
            sa.Column("device_code_expires_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("oauth_tokens", "device_code_expires_at")
    op.drop_column("oauth_tokens", "device_code")
