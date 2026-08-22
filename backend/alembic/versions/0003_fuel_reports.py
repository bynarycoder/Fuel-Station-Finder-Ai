"""create fuel_reports table (crowd-sourced submissions)

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-01

Adds the Phase 6 ``fuel_reports`` table: user-submitted pricing, queue length,
fuel type, optional photo URL and notes. Reports start ``pending``; the status
and queue-length columns are portable VARCHAR guarded by CHECK constraints
(mirroring the ORM enums). Foreign keys cascade on station/user/fuel-type
deletion.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fuel_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("station_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("fuel_type_code", sa.String(length=8), nullable=False),
        sa.Column("price_per_litre", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("queue_length", sa.String(length=12), nullable=True),
        sa.Column("photo_url", sa.String(length=512), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["station_id"], ["fuel_stations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["fuel_type_code"], ["fuel_types.code"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "queue_length IN ('none', 'short', 'medium', 'long')",
            name="ck_fuel_reports_queue_length",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'verified', 'rejected')",
            name="ck_fuel_reports_status",
        ),
    )
    op.create_index(
        "ix_fuel_reports_station_id", "fuel_reports", ["station_id"], unique=False
    )
    op.create_index(
        "ix_fuel_reports_user_id", "fuel_reports", ["user_id"], unique=False
    )
    op.create_index(
        "ix_fuel_reports_status", "fuel_reports", ["status"], unique=False
    )
    op.create_index(
        "ix_fuel_reports_created_at", "fuel_reports", ["created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_fuel_reports_created_at", table_name="fuel_reports")
    op.drop_index("ix_fuel_reports_status", table_name="fuel_reports")
    op.drop_index("ix_fuel_reports_user_id", table_name="fuel_reports")
    op.drop_index("ix_fuel_reports_station_id", table_name="fuel_reports")
    op.drop_table("fuel_reports")
