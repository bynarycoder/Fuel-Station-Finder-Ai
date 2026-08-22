"""add station provenance columns (data_source, verification_status, …)

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-13

Adds provenance/verification metadata to ``fuel_stations`` so the catalogue
can distinguish seeded/demo rows from records imported from (or captured from)
authoritative sources:

* ``data_source``          — seed / official / government / partner /
                             community / imported / other (VARCHAR + CHECK)
* ``verification_status``  — unverified / pending / verified / rejected
* ``verified_at``          — when the record was first verified
* ``last_verified_at``     — when it was last re-verified
* ``source_id``            — optional external identifier for de-duplication

**Existing rows are preserved.** The new columns use ``server_default`` values
(``seed`` / ``unverified``) so the current 176 seeded stations remain intact
and are correctly labelled as unverified demo/seed data — they are never
presented as a verified live registry. The migration is idempotent-friendly
(``ADD COLUMN IF NOT EXISTS`` is avoided for maximum PostgreSQL/SQLite
compatibility; instead each column is added exactly once by Alembic's version
tracking) and fully reversible.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "fuel_stations",
        sa.Column(
            "data_source",
            sa.String(length=20),
            nullable=False,
            server_default="seed",
        ),
    )
    op.add_column(
        "fuel_stations",
        sa.Column(
            "verification_status",
            sa.String(length=20),
            nullable=False,
            server_default="unverified",
        ),
    )
    op.add_column(
        "fuel_stations",
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "fuel_stations",
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "fuel_stations",
        sa.Column("source_id", sa.String(length=100), nullable=True),
    )

    op.create_check_constraint(
        "ck_fuel_stations_data_source",
        "fuel_stations",
        "data_source IN ('seed', 'official', 'government', 'partner', "
        "'community', 'imported', 'other')",
    )
    op.create_check_constraint(
        "ck_fuel_stations_verification_status",
        "fuel_stations",
        "verification_status IN ('unverified', 'pending', 'verified', 'rejected')",
    )
    op.create_index(
        "ix_fuel_stations_data_source", "fuel_stations", ["data_source"], unique=False
    )
    op.create_index(
        "ix_fuel_stations_verification_status",
        "fuel_stations",
        ["verification_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_fuel_stations_verification_status", table_name="fuel_stations")
    op.drop_index("ix_fuel_stations_data_source", table_name="fuel_stations")
    op.drop_constraint(
        "ck_fuel_stations_verification_status", "fuel_stations", type_="check"
    )
    op.drop_constraint(
        "ck_fuel_stations_data_source", "fuel_stations", type_="check"
    )
    op.drop_column("fuel_stations", "source_id")
    op.drop_column("fuel_stations", "last_verified_at")
    op.drop_column("fuel_stations", "verified_at")
    op.drop_column("fuel_stations", "verification_status")
    op.drop_column("fuel_stations", "data_source")
