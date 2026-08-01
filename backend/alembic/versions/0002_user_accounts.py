"""create users table (Supabase auth mirror + application roles)

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-31

Adds the Phase 3 ``users`` table. Authentication is delegated to Supabase Auth;
this table mirrors the Supabase identity (``id`` == ``auth.users.id``) and stores
the application role (driver / station_manager / admin) plus an account-enabled
flag. The role is a portable VARCHAR guarded by a CHECK constraint rather than a
native Postgres ENUM, mirroring the ORM model exactly.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=True),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.CheckConstraint(
            "role IN ('driver', 'station_manager', 'admin')",
            name="ck_users_role",
        ),
    )


def downgrade() -> None:
    op.drop_table("users")
