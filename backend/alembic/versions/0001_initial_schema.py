"""Initial schema: fuel types, stations (PostGIS), and station<->fuel catalog

Revision ID: 0001
Revises:
Create Date: 2026-07-31

Introduces the Phase 2 database schema:

* ``fuel_types``            - reference catalogue of petroleum products (PMS,
                              AGO, DPK, LPG).
* ``fuel_stations``         - the spatial core table; each station's location is
                              stored as a PostGIS ``geography(POINT, 4326)`` with
                              a GiST index for fast nearby searches.
* ``fuel_station_fuel_types`` - many-to-many catalogue of which products each
                              station offers.

The migration enables the ``postgis`` extension (required by the geography
column) and is fully reversible.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The ``location`` column uses the ``geography`` type provided by PostGIS.
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # ------------------------------------------------------------------ fuel_types
    op.create_table(
        "fuel_types",
        sa.Column("code", sa.String(length=8), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("code"),
        sa.CheckConstraint(
            "code IN ('PMS', 'AGO', 'DPK', 'LPG')",
            name="ck_fuel_types_code_domain",
        ),
    )

    # --------------------------------------------------------------- fuel_stations
    op.create_table(
        "fuel_stations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("brand", sa.String(length=100), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=100), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column(
            "location",
            Geography(geometry_type="POINT", srid=4326),
            nullable=False,
        ),
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
        sa.UniqueConstraint("name", "city", name="uq_fuel_stations_name_city"),
    )
    op.create_index(
        "ix_fuel_stations_brand", "fuel_stations", ["brand"], unique=False
    )
    op.create_index(
        "ix_fuel_stations_city", "fuel_stations", ["city"], unique=False
    )
    op.create_index(
        "ix_fuel_stations_is_active",
        "fuel_stations",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_fuel_stations_state", "fuel_stations", ["state"], unique=False
    )
    # NOTE: the GiST spatial index on the ``location`` column
    # (``idx_fuel_stations_location``) is created automatically by GeoAlchemy2's
    # table-creation event listener, so it is intentionally NOT recreated here.

    # -------------------------------------------------- fuel_station_fuel_types
    op.create_table(
        "fuel_station_fuel_types",
        sa.Column("station_id", sa.Uuid(), nullable=False),
        sa.Column("fuel_type_code", sa.String(length=8), nullable=False),
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
        sa.PrimaryKeyConstraint("station_id", "fuel_type_code"),
        sa.ForeignKeyConstraint(
            ["fuel_type_code"],
            ["fuel_types.code"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["station_id"],
            ["fuel_stations.id"],
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("fuel_station_fuel_types")
    op.drop_index("ix_fuel_stations_state", table_name="fuel_stations")
    op.drop_index("ix_fuel_stations_is_active", table_name="fuel_stations")
    op.drop_index("ix_fuel_stations_city", table_name="fuel_stations")
    op.drop_index("ix_fuel_stations_brand", table_name="fuel_stations")
    # Drop the spatial GiST index explicitly before the table; PostgreSQL would
    # also cascade-drop it with the table, but being explicit keeps the downgrade
    # unambiguous regardless of GeoAlchemy2 listener behaviour.
    op.drop_index("idx_fuel_stations_location", table_name="fuel_stations")
    op.drop_table("fuel_stations")
    op.drop_table("fuel_types")
