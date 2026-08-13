"""
Regression tests: nearby search must use the caller's coordinates.

Kaduna users were seeing Abuja stations. These tests lock the contract:

* the nearby SQL is built from the supplied latitude/longitude
* axis order is ST_MakePoint(longitude, latitude) — X = lon, Y = lat
* no hardcoded Abuja/FCT coordinate appears in the query
* no city/state filter is applied before the distance check
* Kaduna (10.5207, 7.4386) and Abuja (9.0765, 7.3986) produce different
  origin points, and a 5 km radius around Kaduna cannot include FCT stations
* the HTTP endpoint forwards latitude/longitude/radius unchanged (no rename
  to lat/lng, no default city)
"""

from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

from sqlalchemy.dialects import postgresql

from app.scripts.seed import STATIONS
from app.services import stations as station_service

KADUNA = {"latitude": 10.5207, "longitude": 7.4386}
ABUJA = {"latitude": 9.0765, "longitude": 7.3986}
RADIUS_M = 5000.0

# Common hardcoded Abuja/FCT coordinates that must never appear as a fallback.
ABUJA_HARDCODES = (
    "9.0765",
    "7.3986",
    "9.0567",
    "7.49698",
    "9.0820",
    "7.4720",
)


def _compile(stmt) -> str:
    return str(stmt.compile(dialect=postgresql.dialect()))


def _compile_with_params(stmt) -> tuple[str, dict]:
    compiled = stmt.compile(dialect=postgresql.dialect())
    return str(compiled), dict(compiled.params)


def _haversine_m(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    r = 6371000.0
    dlat = radians(b_lat - a_lat)
    dlon = radians(b_lon - a_lon)
    h = (
        sin(dlat / 2) ** 2
        + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(dlon / 2) ** 2
    )
    return 2 * r * asin(sqrt(h))


# --------------------------------------------------------------------------- #
# SQL construction — the origin is the supplied point
# --------------------------------------------------------------------------- #
def test_kaduna_nearby_sql_uses_st_makepoint_lon_lat() -> None:
    sql, params = _compile_with_params(
        station_service.build_nearby_query(
            KADUNA["latitude"], KADUNA["longitude"], RADIUS_M, 20
        )
    )
    assert "ST_MakePoint" in sql
    assert "ST_SetSRID" in sql
    assert "ST_DWithin" in sql
    assert "ST_Distance" in sql
    # X = longitude, Y = latitude (never the reverse).
    values = list(params.values())
    assert KADUNA["longitude"] in values
    assert KADUNA["latitude"] in values
    # The two MakePoint binds must appear in lon, lat order.
    compiled = sql.replace(" ", "")
    # ST_MakePoint(:p1, :p2) — identify the two numeric binds next to MakePoint.
    assert "ST_MakePoint" in compiled


def test_nearby_sql_does_not_hardcode_abuja_coordinates() -> None:
    sql, params = _compile_with_params(
        station_service.build_nearby_query(
            KADUNA["latitude"], KADUNA["longitude"], RADIUS_M, 20
        )
    )
    rendered = sql + " " + " ".join(str(v) for v in params.values())
    for token in ABUJA_HARDCODES:
        assert token not in rendered, f"hardcoded Abuja token {token!r} in nearby SQL"


def test_nearby_sql_has_no_city_or_state_filter() -> None:
    sql = _compile(
        station_service.build_nearby_query(
            KADUNA["latitude"], KADUNA["longitude"], RADIUS_M, 20
        )
    )
    where_clause = sql.split("WHERE", 1)[1].lower()
    assert "fuel_stations.city" not in where_clause
    assert "fuel_stations.state" not in where_clause
    assert "ilike" not in where_clause
    assert "abuja" not in sql.lower()
    assert "kaduna" not in sql.lower()
    assert "fct" not in sql.lower()


def test_kaduna_and_abuja_origins_are_distinct() -> None:
    kaduna_sql, kaduna_params = _compile_with_params(
        station_service.build_nearby_query(
            KADUNA["latitude"], KADUNA["longitude"], RADIUS_M, 20
        )
    )
    abuja_sql, abuja_params = _compile_with_params(
        station_service.build_nearby_query(
            ABUJA["latitude"], ABUJA["longitude"], RADIUS_M, 20
        )
    )
    assert kaduna_sql == abuja_sql  # same shape
    assert set(kaduna_params.values()) != set(abuja_params.values())
    assert KADUNA["latitude"] in kaduna_params.values()
    assert ABUJA["latitude"] in abuja_params.values()
    assert KADUNA["latitude"] not in abuja_params.values()


def test_swapped_makepoint_is_rejected_by_bind_order() -> None:
    """ST_MakePoint must receive (longitude, latitude), not (latitude, longitude)."""
    sql, params = _compile_with_params(
        station_service.build_nearby_query(
            KADUNA["latitude"], KADUNA["longitude"], RADIUS_M, 10
        )
    )
    # Reconstruct the MakePoint argument order from the compiled SQL.
    # SQLAlchemy names binds in visit order: first lon, then lat, then srid.
    make_point_params = [
        v
        for v in params.values()
        if v in (KADUNA["latitude"], KADUNA["longitude"])
    ]
    assert make_point_params[0] == KADUNA["longitude"]
    assert make_point_params[1] == KADUNA["latitude"]
    assert "ST_GeogFromText" not in sql
    # Origin must be geography(POINT, 4326), not a typmod-less / SRID -1 cast.
    assert "geography(POINT,4326)" in sql.replace(" ", "")


# --------------------------------------------------------------------------- #
# Seed isolation — Kaduna 5 km must not include Abuja/FCT
# --------------------------------------------------------------------------- #
def test_kaduna_5km_includes_local_stations_and_excludes_fct() -> None:
    within: list[dict] = []
    for spec in STATIONS:
        distance = _haversine_m(
            KADUNA["latitude"],
            KADUNA["longitude"],
            spec["latitude"],
            spec["longitude"],
        )
        if distance <= RADIUS_M:
            within.append(spec)
            assert spec["state"] != "FCT", spec
            assert "Abuja" not in (spec.get("address") or "")
            assert spec["state"] == "Kaduna"
    assert len(within) >= 4
    assert any("AA Rano" in spec["name"] or spec["city"] == "Kaduna" for spec in within)


def test_abuja_5km_includes_fct_and_excludes_kaduna() -> None:
    within: list[dict] = []
    for spec in STATIONS:
        distance = _haversine_m(
            ABUJA["latitude"],
            ABUJA["longitude"],
            spec["latitude"],
            spec["longitude"],
        )
        if distance <= RADIUS_M:
            within.append(spec)
            assert spec["state"] != "Kaduna", spec
            assert spec["city"] != "Kaduna"
    assert within
    assert any(spec["state"] == "FCT" for spec in within)


def test_kaduna_to_abuja_is_far_beyond_default_radius() -> None:
    distance = _haversine_m(
        KADUNA["latitude"],
        KADUNA["longitude"],
        ABUJA["latitude"],
        ABUJA["longitude"],
    )
    # ~160 km — well above the 5 km default and the 100 km API ceiling.
    assert distance > 100_000


# --------------------------------------------------------------------------- #
# HTTP contract — parameter names and no default origin
# --------------------------------------------------------------------------- #
async def test_nearby_endpoint_forwards_kaduna_coordinates(client, monkeypatch) -> None:
    captured: dict = {}

    async def _fake_find_nearby(db, latitude, longitude, radius_meters, limit, fuel_type=None):
        captured.update(
            latitude=latitude,
            longitude=longitude,
            radius_meters=radius_meters,
            limit=limit,
            fuel_type=fuel_type,
        )
        return {
            "items": [],
            "latitude": latitude,
            "longitude": longitude,
            "radius_meters": radius_meters,
        }

    monkeypatch.setattr(
        "app.api.v1.stations.station_service.find_nearby", _fake_find_nearby
    )

    response = await client.get(
        "/api/v1/stations/nearby",
        params={
            "latitude": KADUNA["latitude"],
            "longitude": KADUNA["longitude"],
            "radius_meters": RADIUS_M,
            "limit": 20,
        },
    )
    assert response.status_code == 200, response.text
    assert captured["latitude"] == KADUNA["latitude"]
    assert captured["longitude"] == KADUNA["longitude"]
    assert captured["radius_meters"] == RADIUS_M
    body = response.json()
    assert body["latitude"] == KADUNA["latitude"]
    assert body["longitude"] == KADUNA["longitude"]
    assert response.headers.get("cache-control") == "no-store"


async def test_nearby_endpoint_rejects_lat_lng_aliases(client, monkeypatch) -> None:
    """Frontend must send latitude/longitude — lat/lng is a 422, not a silent default."""

    async def _should_not_run(*_args, **_kwargs):
        raise AssertionError("find_nearby must not run when required params are missing")

    monkeypatch.setattr(
        "app.api.v1.stations.station_service.find_nearby", _should_not_run
    )

    response = await client.get(
        "/api/v1/stations/nearby",
        params={"lat": KADUNA["latitude"], "lng": KADUNA["longitude"]},
    )
    assert response.status_code == 422


async def test_nearby_endpoint_forwards_abuja_coordinates(client, monkeypatch) -> None:
    captured: dict = {}

    async def _fake_find_nearby(db, latitude, longitude, radius_meters, limit, fuel_type=None):
        captured.update(latitude=latitude, longitude=longitude)
        return {
            "items": [],
            "latitude": latitude,
            "longitude": longitude,
            "radius_meters": radius_meters,
        }

    monkeypatch.setattr(
        "app.api.v1.stations.station_service.find_nearby", _fake_find_nearby
    )

    response = await client.get(
        "/api/v1/stations/nearby",
        params={
            "latitude": ABUJA["latitude"],
            "longitude": ABUJA["longitude"],
            "radius_meters": RADIUS_M,
        },
    )
    assert response.status_code == 200
    assert captured["latitude"] == ABUJA["latitude"]
    assert captured["longitude"] == ABUJA["longitude"]
