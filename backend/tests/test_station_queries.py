"""
Query-construction & pure-helper tests for the stations service (Phase 4).

These compile the service's ``Select`` builders against the PostgreSQL dialect
(no live database required, no mocks) and assert the generated SQL contains the
correct PostGIS functions, filters, pagination and ordering — validating the
real spatial logic. The pure mapping helper is exercised with in-memory ORM
objects.
"""

from __future__ import annotations

import datetime
import uuid

from geoalchemy2 import WKTElement
from sqlalchemy.dialects import postgresql

from app.services import stations as station_service


def _compile(stmt) -> str:
    return str(stmt.compile(dialect=postgresql.dialect()))


# --------------------------------------------------------------------------- #
# List / count queries
# --------------------------------------------------------------------------- #
def test_list_query_selects_coordinates_and_paginates() -> None:
    sql = _compile(station_service.build_list_query(station_service.StationFilters(), 40, 20))
    assert "ST_Y(fuel_stations.location) AS latitude" in sql
    assert "ST_X(fuel_stations.location) AS longitude" in sql
    assert "ORDER BY" in sql
    assert "LIMIT" in sql and "OFFSET" in sql


def test_list_query_applies_all_filters() -> None:
    filters = station_service.StationFilters(
        q="mobil", brand="nnpc", city="lag", state="lagos", fuel_type="PMS"
    )
    sql = _compile(station_service.build_list_query(filters, 0, 10))
    assert "ILIKE" in sql  # name/brand/city/state filters
    assert "EXISTS" in sql  # fuel_type membership subquery
    assert "fuel_type_code" in sql


def test_list_query_defaults_to_active_only() -> None:
    sql = _compile(station_service.build_list_query(station_service.StationFilters(), 0, 10))
    assert "is_active IS true" in sql


def test_list_query_can_include_inactive() -> None:
    filters = station_service.StationFilters(is_active=None)
    sql = _compile(station_service.build_list_query(filters, 0, 10))
    # No is_active WHERE clause when the filter is None.
    assert "is_active IS" not in sql


def test_count_query_mirrors_filters() -> None:
    filters = station_service.StationFilters(fuel_type="AGO")
    sql = _compile(station_service.build_count_query(filters))
    assert "count(fuel_stations.id)" in sql
    assert "EXISTS" in sql


# --------------------------------------------------------------------------- #
# Nearby query (the spatial core)
# --------------------------------------------------------------------------- #
def test_nearby_query_uses_postgis_distance_functions() -> None:
    sql = _compile(
        station_service.build_nearby_query(
            station_service.geography_point(6.6, 3.35), 5000.0, 10
        )
    )
    assert "ST_DWithin" in sql
    assert "ST_Distance" in sql
    # The origin point must be cast to geography to match the location column.
    assert "AS geography" in sql
    assert "ORDER BY distance_meters ASC" in sql
    assert "LIMIT" in sql


def test_nearby_query_filters_to_active_stations() -> None:
    sql = _compile(
        station_service.build_nearby_query(
            station_service.geography_point(6.6, 3.35), 1000.0, 5
        )
    )
    assert "is_active IS true" in sql


def test_nearby_query_supports_fuel_type_filter() -> None:
    sql = _compile(
        station_service.build_nearby_query(
            station_service.geography_point(6.6, 3.35), 1000.0, 5, fuel_type="LPG"
        )
    )
    assert "EXISTS" in sql
    assert "LPG" in sql or "fuel_type_code" in sql


# --------------------------------------------------------------------------- #
# Get-by-id query
# --------------------------------------------------------------------------- #
def test_get_query_selects_coordinates_and_filters_by_id() -> None:
    station_id = uuid.uuid4()
    sql = _compile(station_service.build_get_query(station_id))
    assert "ST_Y" in sql and "ST_X" in sql
    assert "WHERE fuel_stations.id =" in sql


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #
def test_geography_point_is_wgs84_lonlat_ordered() -> None:
    point = station_service.geography_point(6.6, 3.35)
    assert isinstance(point, WKTElement)
    assert point.srid == 4326
    # WKT is longitude-first.
    assert "POINT(3.35 6.6)" in str(point)


def test_station_to_public_maps_station_and_fuel_links() -> None:
    fuel_type = station_service.FuelType(code="PMS", name="Premium Motor Spirit")
    link = station_service.FuelStationFuelType(fuel_type_code="PMS")
    link.fuel_type = fuel_type

    station = station_service.FuelStation(
        name="NNPC Ikeja",
        brand="NNPC",
        city="Ikeja",
        state="Lagos",
        is_active=True,
        location=WKTElement("POINT(3.35 6.6)", srid=4326),
    )
    station.id = uuid.uuid4()
    station.created_at = datetime.datetime.now(datetime.timezone.utc)
    station.updated_at = station.created_at
    station.fuel_type_links.append(link)

    payload = station_service.station_to_public(station, 6.6, 3.35)

    assert payload["name"] == "NNPC Ikeja"
    assert payload["brand"] == "NNPC"
    assert payload["latitude"] == 6.6
    assert payload["longitude"] == 3.35
    assert payload["is_active"] is True
    assert payload["fuel_types"] == [
        {"code": "PMS", "name": "Premium Motor Spirit"}
    ]
    assert "id" in payload and "created_at" in payload
