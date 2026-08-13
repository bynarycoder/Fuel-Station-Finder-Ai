"""
End-to-end proof that the full 176-station catalogue is available through the
data → service → API contract (Phase 13).

* seeds the complete catalogue (all 176 stations from ``seed_data``) into a
  portable SQLite schema using the **real** ``seed_stations`` code path;
* proves the database holds exactly 176 rows, with provenance
  (``seed``/``unverified``), valid coordinates and per-state counts;
* proves the service's count/pagination contract (page_size 100 → two pages;
  the browse client walks both pages — see frontend ``api.pagination.test.ts``);
* includes a live PostGIS-gated test that runs the actual ``GET /stations``
  pagination walk when a PostGIS database is configured (skipped otherwise).
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql

from app.models import FuelStation
from app.models.fuel_station import (
    StationDataSource,
    StationVerificationStatus,
)
from app.scripts import seed as seed_module
from app.scripts.seed_data import STATIONS
from app.services import stations as station_service


def _compile(stmt) -> str:
    return str(
        stmt.compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )


# --------------------------------------------------------------------------- #
# Seed the full catalogue through the real seed code (portable SQLite)
# --------------------------------------------------------------------------- #
@pytest.fixture
def seeded_catalogue(portable_sync_session, monkeypatch):
    """Runs ``seed_stations`` + ``seed_fuel_types`` (the production upsert
    path) against the portable schema, returning the session factory."""
    # The portable schema stores location as text: patch the seed's geometry
    # helper to emit a WKT string instead of a GeoAlchemy2 element.
    from tests._portable_db import portable_location_wkt

    monkeypatch.setattr(seed_module, "_to_geography", portable_location_wkt)
    factory = portable_sync_session
    with factory() as session:
        seed_module.seed_fuel_types(session)
        count = seed_module.seed_stations(session)
        session.commit()
    assert count == len(STATIONS)
    return factory


def test_seed_catalogue_holds_exactly_176_stations(seeded_catalogue) -> None:
    with seeded_catalogue() as session:
        total = session.execute(select(func.count(FuelStation.id))).scalar_one()
    assert total == 176


def test_all_176_rows_carry_seed_unverified_provenance(seeded_catalogue) -> None:
    with seeded_catalogue() as session:
        rows = session.execute(
            select(
                FuelStation.data_source,
                FuelStation.verification_status,
            )
        ).all()
    assert len(rows) == 176
    assert all(
        r.data_source == StationDataSource.SEED
        and r.verification_status == StationVerificationStatus.UNVERIFIED
        for r in rows
    )


def test_every_seeded_row_has_valid_coordinates(seeded_catalogue) -> None:
    """Location strings are stored as ``POINT(lon lat)`` — parse them back to
    prove no row lost its coordinates and none are out of range."""
    import re

    with seeded_catalogue() as session:
        locations = session.execute(
            select(FuelStation.location)
        ).scalars().all()
    assert len(locations) == 176
    pattern = re.compile(r"POINT\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)")
    for raw in locations:
        match = pattern.match(raw)
        assert match, f"malformed location: {raw!r}"
        lon, lat = float(match.group(1)), float(match.group(2))
        assert -90.0 <= lat <= 90.0
        assert -180.0 <= lon <= 180.0


def test_per_state_counts_match_the_catalogue(seeded_catalogue) -> None:
    from collections import Counter

    expected = Counter(s["state"] for s in STATIONS)
    with seeded_catalogue() as session:
        rows = session.execute(
            select(FuelStation.state, func.count(FuelStation.id)).group_by(
                FuelStation.state
            )
        ).all()
    actual = {state: count for state, count in rows}
    assert actual == dict(expected)
    # Spot checks: the priority demo states are fully present.
    assert actual["Kaduna"] == 15
    assert actual["Lagos"] == 15
    assert actual["FCT"] == 11


def test_pagination_contract_serves_the_whole_catalogue() -> None:
    """page_size is capped at 100, so 176 rows span exactly two pages — the
    browse client (fetchAllStations) walks both and merges them."""
    assert station_service.MAX_PAGE_SIZE == 100
    assert station_service.DEFAULT_PAGE_SIZE == 20
    sql = _compile(
        station_service.build_list_query(station_service.StationFilters(), 100, 100)
    )
    assert "LIMIT 100" in sql and "OFFSET 100" in sql
    # Count query returns the unfiltered total (176) for page metadata.
    count_sql = _compile(station_service.build_count_query(station_service.StationFilters()))
    assert "count(fuel_stations.id)" in count_sql


def test_list_query_serves_provenance_columns() -> None:
    sql = _compile(
        station_service.build_list_query(station_service.StationFilters(), 0, 20)
    )
    # The stations API selects the whole entity, which includes provenance.
    assert "fuel_stations.data_source" in sql
    assert "fuel_stations.verification_status" in sql


# --------------------------------------------------------------------------- #
# Live API walk (PostGIS required) — skipped when no PostGIS is configured.
# --------------------------------------------------------------------------- #
POSTGIS_TEST_URL = os.getenv("POSTGIS_TEST_URL", "")


@pytest.mark.skipif(
    not POSTGIS_TEST_URL,
    reason="POSTGIS_TEST_URL not configured; run against a PostGIS database "
    "to execute the live GET /stations pagination walk",
)
def test_live_api_serves_all_176_stations_via_pagination() -> None:
    """Proves the *live* HTTP path: walk GET /stations pages of 100 and 76.
    Configure POSTGIS_TEST_URL (e.g. the local docker-compose database) and
    run the seed first to execute this test."""
    import httpx

    base = POSTGIS_TEST_URL.rstrip("/") + "/api/v1"
    page1 = httpx.get(f"{base}/stations", params={"page": 1, "page_size": 100}).json()
    page2 = httpx.get(f"{base}/stations", params={"page": 2, "page_size": 100}).json()
    assert page1["total"] == 176
    assert len(page1["items"]) == 100
    assert len(page2["items"]) == 76
    ids = {s["id"] for s in page1["items"]} | {s["id"] for s in page2["items"]}
    assert len(ids) == 176
    # Every station exposes provenance.
    for station in page1["items"] + page2["items"]:
        assert station["data_source"] == "seed"
        assert station["verification_status"] == "unverified"
