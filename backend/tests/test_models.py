"""
Schema-level tests for the Phase 2 SQLAlchemy 2.0 models.

These assertions introspect ``Base.metadata`` and the compiled PostgreSQL DDL
directly, so they validate the real schema definition (table names, column
types, constraints, foreign keys and the PostGIS spatial index) **without**
needing a running database — and without mocking anything.
"""

from __future__ import annotations

import uuid

import pytest
from geoalchemy2 import Geography, WKTElement
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

from app.core.database import Base
from app.models import (
    FuelStation,
    FuelStationFuelType,
    FuelType,
    FuelTypeCode,
)


# --------------------------------------------------------------------------- #
# Table / metadata registration
# --------------------------------------------------------------------------- #
EXPECTED_TABLES = {
    "fuel_types",
    "fuel_stations",
    "fuel_station_fuel_types",
    "users",
    "fuel_reports",
    "favorites",
}


def test_all_models_registered_on_metadata() -> None:
    """Every domain table must be present on the shared metadata so Alembic
    can see it when generating/running migrations."""
    assert EXPECTED_TABLES.issubset(Base.metadata.tables)


# --------------------------------------------------------------------------- #
# fuel_types
# --------------------------------------------------------------------------- #
def test_fuel_type_uses_code_as_natural_primary_key() -> None:
    table = FuelType.__table__
    pk_cols = [c.name for c in table.primary_key.columns]
    assert pk_cols == ["code"]


def test_fuel_type_code_domain_check_constraint() -> None:
    """The DB-level CHECK constraint must lock the catalogue to canonical codes."""
    table = FuelType.__table__
    check = next(
        c
        for c in table.constraints
        if c.__class__.__name__ == "CheckConstraint"
    )
    sql = str(check.sqltext.compile(dialect=postgresql.dialect()))
    for code in FuelTypeCode.codes():
        assert code in sql


def test_fuel_type_codes_are_canonical_nigerian_products() -> None:
    assert {c.value for c in FuelTypeCode} == {"PMS", "AGO", "DPK", "LPG", "CNG"}


# --------------------------------------------------------------------------- #
# fuel_stations (spatial core)
# --------------------------------------------------------------------------- #
def test_fuel_station_has_uuid_primary_key() -> None:
    table = FuelStation.__table__
    pk_cols = [c.name for c in table.primary_key.columns]
    assert pk_cols == ["id"]
    assert isinstance(table.c.id.default.arg, type(uuid.uuid4))


def test_fuel_station_location_is_postgis_geography_point() -> None:
    """The location column is a PostGIS geography(POINT, 4326) — the type that
    makes metre-accurate 'nearby' queries on the sphere trivial."""
    location_type = FuelStation.__table__.c.location.type
    assert isinstance(location_type, Geography)
    assert str(location_type) == "geography(POINT,4326)"
    assert location_type.srid == 4326


def test_fuel_station_location_is_non_nullable() -> None:
    assert FuelStation.__table__.c.location.nullable is False


def test_fuel_station_has_gist_spatial_index() -> None:
    """The GiST index on location is what powers fast spatial queries."""
    indexes = {i.name: i for i in FuelStation.__table__.indexes}
    assert "idx_fuel_stations_location" in indexes
    idx = indexes["idx_fuel_stations_location"]
    assert [c.name for c in idx.columns] == ["location"]
    assert idx.dialect_options["postgresql"]["using"] == "gist"


def test_fuel_station_has_name_city_unique_constraint() -> None:
    """(name, city) is the natural business key used to de-dupe seed rows."""
    table = FuelStation.__table__
    uniques = [
        tuple(sorted(c.name for c in uc.columns))
        for uc in table.constraints
        if uc.__class__.__name__ == "UniqueConstraint"
    ]
    assert ("city", "name") in uniques


def test_fuel_station_expected_filtering_indexes() -> None:
    index_names = {i.name for i in FuelStation.__table__.indexes}
    assert {
        "ix_fuel_stations_brand",
        "ix_fuel_stations_city",
        "ix_fuel_stations_state",
        "ix_fuel_stations_is_active",
    }.issubset(index_names)


# --------------------------------------------------------------------------- #
# fuel_station_fuel_types (association)
# --------------------------------------------------------------------------- #
def test_association_has_composite_primary_key() -> None:
    table = FuelStationFuelType.__table__
    pk_cols = sorted(c.name for c in table.primary_key.columns)
    assert pk_cols == ["fuel_type_code", "station_id"]


def test_association_foreign_keys_cascade_on_delete() -> None:
    fks = {fk.parent.name: fk for fk in FuelStationFuelType.__table__.foreign_keys}
    assert set(fks) == {"station_id", "fuel_type_code"}

    assert fks["station_id"].column.table.name == "fuel_stations"
    assert fks["station_id"].column.name == "id"
    assert fks["station_id"].ondelete == "CASCADE"

    assert fks["fuel_type_code"].column.table.name == "fuel_types"
    assert fks["fuel_type_code"].column.name == "code"
    assert fks["fuel_type_code"].ondelete == "CASCADE"


# --------------------------------------------------------------------------- #
# Cross-cutting
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "model",
    [FuelType, FuelStation, FuelStationFuelType],
)
def test_every_model_has_audit_timestamps(model) -> None:
    cols = {c.name for c in model.__table__.columns}
    assert {"created_at", "updated_at"}.issubset(cols)
    assert model.__table__.c.created_at.nullable is False
    assert model.__table__.c.updated_at.nullable is False


def test_models_compile_to_valid_postgresql_ddl() -> None:
    """Every Phase 2 table compiles to syntactically valid PostgreSQL DDL."""
    from sqlalchemy.schema import CreateTable

    dialect = postgresql.dialect()
    for table_name in EXPECTED_TABLES:
        ddl = str(
            CreateTable(Base.metadata.tables[table_name]).compile(dialect=dialect)
        )
        assert ddl.strip().startswith("CREATE TABLE")


def test_fuel_station_instantiates_with_geography_location() -> None:
    """Smoke test: a station object can be constructed with the expected attrs
    before any database interaction."""
    station = FuelStation(
        name="Test Station",
        brand="NNPC",
        city="Ikeja",
        state="Lagos",
        location=WKTElement("POINT(3.3515 6.6018)", srid=4326),
    )
    assert station.name == "Test Station"
    assert isinstance(station.location, WKTElement)


def test_inspector_sees_no_orphan_tables() -> None:
    """No accidental tables beyond the Phase 2 domain (Alembic's
    ``alembic_version`` bookkeeping table is managed separately)."""
    table_names = set(Base.metadata.tables.keys())
    assert table_names == EXPECTED_TABLES
