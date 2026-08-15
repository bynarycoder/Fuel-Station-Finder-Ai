"""
API-level tests for the Fuel Intelligence endpoint (POST /api/v1/ai/recommend).

The full pipeline runs against real rows in the portable SQLite database
(stations, fuel types, price reports). Only the PostGIS spatial query is
replaced — SQLite has no PostGIS — by an emulation that mirrors the real
``find_nearby`` filters and output shape. Everything else (intent handling,
report-price lookup, deterministic ranking, response schemas, provenance
pass-through, graceful degradation) is the production code path.

Safety properties asserted here:
* the LLM is never required: with no API key the deterministic path answers
* AI failures (timeout / garbage) never break the feature or the station API
* provenance is passed through untouched — AI recommendations never verify
* no location -> honest "needs your location" answer (no invented coords)
* database failure -> clean 503 while the normal API keeps working
"""

from __future__ import annotations

import math
import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import (
    FuelReport,
    FuelStation,
    FuelStationFuelType,
    FuelType,
    ReportStatus,
    User,
)
from app.models.fuel_station import (
    StationDataSource,
    StationVerificationStatus,
)
from app.services.ai import recommend
from app.services.stations import station_to_public
from tests._portable_db import portable_location_wkt

NOW = datetime.now(timezone.utc)

# A point nowhere near Abuja or Kaduna — proves no fallback coordinates are used.
REQUEST_LAT = 6.5244  # Lagos (Victoria Island-ish)
REQUEST_LON = 3.3792


@pytest.fixture(autouse=True)
def _reset_recommend_cache():
    recommend.clear_recommend_cache()
    yield
    recommend.clear_recommend_cache()


# --------------------------------------------------------------------------- #
# Portable PostGIS emulation for find_nearby
# --------------------------------------------------------------------------- #
def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000.0
    to_rad = math.pi / 180.0
    dlat = (lat2 - lat1) * to_rad
    dlon = (lon2 - lon1) * to_rad
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1 * to_rad) * math.cos(lat2 * to_rad) * math.sin(dlon / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def make_portable_find_nearby(call_log: list | None = None):
    """Build an async ``find_nearby`` replacement that queries the portable DB
    with the same filters/order/shape as the real PostGIS implementation.
    ``call_log`` (when provided) records every invocation's arguments."""

    async def _fake(db, latitude, longitude, radius_meters=5000.0, limit=50, fuel_type=None, verification_status=None):
        if call_log is not None:
            call_log.append(
                {
                    "latitude": latitude,
                    "longitude": longitude,
                    "radius_meters": radius_meters,
                    "fuel_type": fuel_type,
                    "verification_status": verification_status,
                }
            )
        stmt = (
            select(FuelStation)
            .options(
                selectinload(FuelStation.fuel_type_links).joinedload(
                    FuelStationFuelType.fuel_type
                )
            )
            .where(FuelStation.is_active.is_(True))
        )
        rows = (await db.execute(stmt)).scalars().all()
        items = []
        for station in rows:
            codes = {link.fuel_type.code for link in station.fuel_type_links}
            if fuel_type and fuel_type not in codes:
                continue
            if verification_status and station.verification_status.value != verification_status:
                continue
            match = re.match(r"POINT\(([-\d.]+) ([-\d.]+)\)", str(station.location))
            assert match, "portable station must store WKT coordinates"
            lon, lat = float(match.group(1)), float(match.group(2))
            distance = _haversine_m(latitude, longitude, lat, lon)
            if distance > radius_meters:
                continue
            items.append(
                {**station_to_public(station, lat, lon), "distance_meters": distance}
            )
        items.sort(key=lambda item: item["distance_meters"])
        return {
            "items": items[:limit],
            "latitude": latitude,
            "longitude": longitude,
            "radius_meters": radius_meters,
        }

    return _fake


# --------------------------------------------------------------------------- #
# Seeding
# --------------------------------------------------------------------------- #
async def seed_catalogue(portable_client, stations, reports=None) -> dict[str, uuid.UUID]:
    """Insert fuel types, stations (with links) and optional price reports."""
    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        for code in ("PMS", "AGO", "DPK", "LPG", "CNG"):
            session.add(FuelType(code=code, name=code, description="", is_active=True))
        user_id = uuid.uuid4()
        session.add(
            User(id=user_id, email=f"{uuid.uuid4().hex}@example.com", is_active=True)
        )
        ids = {}
        for spec in stations:
            station_id = uuid.uuid4()
            ids[spec["name"]] = station_id
            session.add(
                FuelStation(
                    id=station_id,
                    name=spec["name"],
                    brand=spec.get("brand"),
                    city=spec.get("city", "Lagos"),
                    state=spec.get("state", "Lagos"),
                    location=portable_location_wkt(spec["lat"], spec["lon"]),
                    is_active=True,
                    data_source=spec.get("data_source", StationDataSource.SEED),
                    verification_status=spec.get(
                        "verification_status", StationVerificationStatus.UNVERIFIED
                    ),
                    source_id=spec.get("source_id"),
                )
            )
            for code in spec.get("fuels", ["PMS"]):
                session.add(FuelStationFuelType(station_id=station_id, fuel_type_code=code))
        for report in reports or []:
            session.add(
                FuelReport(
                    id=uuid.uuid4(),
                    station_id=ids[report["station"]],
                    user_id=user_id,
                    fuel_type_code=report.get("fuel", "PMS"),
                    price_per_litre=report["price"],
                    status=report.get("status", ReportStatus.VERIFIED),
                    created_at=report.get("created_at", NOW - timedelta(days=1)),
                )
            )
        await session.commit()
    return ids


def _recommend_payload(query="cheapest petrol", lat=REQUEST_LAT, lon=REQUEST_LON):
    return {"query": query, "latitude": lat, "longitude": lon}


# --------------------------------------------------------------------------- #
# Happy paths
# --------------------------------------------------------------------------- #
async def test_recommend_ranks_cheapest_real_rows(portable_client, monkeypatch) -> None:
    await seed_catalogue(
        portable_client,
        stations=[
            {"name": "Expensive Co", "lat": REQUEST_LAT + 0.01, "lon": REQUEST_LON},
            {"name": "Cheap Co", "lat": REQUEST_LAT + 0.02, "lon": REQUEST_LON},
            {"name": "No Price Co", "lat": REQUEST_LAT + 0.005, "lon": REQUEST_LON},
        ],
        reports=[
            {"station": "Expensive Co", "price": 980},
            {"station": "Cheap Co", "price": 850},
        ],
    )
    calls: list = []
    monkeypatch.setattr(
        "app.services.stations.find_nearby", make_portable_find_nearby(calls)
    )

    response = await portable_client.post(
        "/api/v1/ai/recommend", json=_recommend_payload("Find the cheapest petrol near me")
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["intent"]["fuel_type"] == "PMS"
    assert body["intent"]["sort_preference"] == "price"
    # No API key in tests -> deterministic fallback, transparently flagged.
    assert body["intent_source"] == "fallback"
    assert body["answer_source"] == "fallback"

    assert next(r["station"]["name"] for r in body["recommendations"]) == "Cheap Co"
    top = body["recommendations"][0]
    assert top["latest_price"] == 850
    assert top["score"] == max(r["score"] for r in body["recommendations"])
    assert "₦850" in body["answer"]

    # Provenance passes through untouched.
    assert top["station"]["verification_status"] == "unverified"
    assert top["station"]["data_source"] == "seed"

    # The exact client coordinates drove the search (no invented origin).
    assert calls[0]["latitude"] == REQUEST_LAT
    assert calls[0]["longitude"] == REQUEST_LON


async def test_recommend_uses_groq_when_configured(portable_client, monkeypatch) -> None:
    await seed_catalogue(
        portable_client,
        stations=[
            {"name": "Solo Co", "lat": REQUEST_LAT + 0.01, "lon": REQUEST_LON},
        ],
        reports=[{"station": "Solo Co", "price": 870}],
    )
    monkeypatch.setattr(
        "app.services.stations.find_nearby", make_portable_find_nearby()
    )
    monkeypatch.setattr(
        recommend,
        "parse_recommend_intent",
        lambda text: recommend.FuelSearchIntent(
            fuel_type="PMS", sort_preference="price", raw=text
        ),
    )
    monkeypatch.setattr(
        recommend,
        "generate_explanation",
        lambda intent, top: "Solo Co is recommended because of its reported price.",
    )

    response = await portable_client.post(
        "/api/v1/ai/recommend", json=_recommend_payload("cheapest petrol")
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["intent_source"] == "groq"
    assert body["answer_source"] == "groq"
    assert body["answer"] == "Solo Co is recommended because of its reported price."


async def test_recommend_rejected_reports_are_ignored_for_price(portable_client, monkeypatch) -> None:
    await seed_catalogue(
        portable_client,
        stations=[
            {"name": "Mixed Co", "lat": REQUEST_LAT + 0.01, "lon": REQUEST_LON},
        ],
        reports=[
            {"station": "Mixed Co", "price": 999, "status": ReportStatus.REJECTED},
            {"station": "Mixed Co", "price": 830, "status": ReportStatus.VERIFIED,
             "created_at": NOW - timedelta(days=5)},
        ],
    )
    monkeypatch.setattr(
        "app.services.stations.find_nearby", make_portable_find_nearby()
    )

    response = await portable_client.post(
        "/api/v1/ai/recommend", json=_recommend_payload("cheapest petrol")
    )
    body = response.json()
    assert body["recommendations"][0]["latest_price"] == 830


async def test_recommend_require_verified_filters_server_side(portable_client, monkeypatch) -> None:
    await seed_catalogue(
        portable_client,
        stations=[
            {
                "name": "Trusted Co",
                "lat": REQUEST_LAT + 0.01,
                "lon": REQUEST_LON,
                "verification_status": StationVerificationStatus.VERIFIED,
                "data_source": StationDataSource.OFFICIAL,
            },
            {
                "name": "Imported Co",
                "lat": REQUEST_LAT + 0.02,
                "lon": REQUEST_LON,
                "verification_status": StationVerificationStatus.UNVERIFIED,
                "data_source": StationDataSource.IMPORTED,
            },
        ],
    )
    calls: list = []
    monkeypatch.setattr(
        "app.services.stations.find_nearby", make_portable_find_nearby(calls)
    )
    monkeypatch.setattr(
        recommend,
        "parse_recommend_intent",
        lambda text: recommend.FuelSearchIntent(
            fuel_type="PMS", require_verified=True, raw=text
        ),
    )

    response = await portable_client.post(
        "/api/v1/ai/recommend", json=_recommend_payload("only verified petrol stations")
    )
    body = response.json()
    assert calls[0]["verification_status"] == "verified"
    assert [r["station"]["name"] for r in body["recommendations"]] == ["Trusted Co"]


async def test_recommend_imported_unverified_stays_labeled(portable_client, monkeypatch) -> None:
    await seed_catalogue(
        portable_client,
        stations=[
            {
                "name": "OSM Station",
                "lat": REQUEST_LAT + 0.01,
                "lon": REQUEST_LON,
                "verification_status": StationVerificationStatus.UNVERIFIED,
                "data_source": StationDataSource.IMPORTED,
                "source_id": "osm-123",
            },
        ],
    )
    monkeypatch.setattr(
        "app.services.stations.find_nearby", make_portable_find_nearby()
    )

    response = await portable_client.post(
        "/api/v1/ai/recommend", json=_recommend_payload("most reliable station")
    )
    body = response.json()
    top = body["recommendations"][0]
    # AI recommendation does NOT equal verification: labels stay honest.
    assert top["station"]["data_source"] == "imported"
    assert top["station"]["verification_status"] == "unverified"
    assert top["station"]["source_id"] == "osm-123"
    assert "verified" not in body["answer"].lower()
    assert "verified" not in top["reason"].lower()


# --------------------------------------------------------------------------- #
# Uncertainty & validation
# --------------------------------------------------------------------------- #
async def test_recommend_without_location_asks_for_it(portable_client) -> None:
    response = await portable_client.post(
        "/api/v1/ai/recommend", json={"query": "cheapest petrol"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["needs_location"] is True
    assert "location" in body["answer"].lower()
    assert body["recommendations"] == []
    assert body["intent"] is None


async def test_recommend_with_no_stations_is_honest(portable_client, monkeypatch) -> None:
    await seed_catalogue(portable_client, stations=[])
    monkeypatch.setattr(
        "app.services.stations.find_nearby", make_portable_find_nearby()
    )
    response = await portable_client.post(
        "/api/v1/ai/recommend", json=_recommend_payload("cheapest diesel")
    )
    body = response.json()
    assert response.status_code == 200
    assert body["recommendations"] == []
    assert "couldn't find a nearby station" in body["answer"]


async def test_recommend_validation_rejects_bad_input(portable_client) -> None:
    # Empty query.
    response = await portable_client.post(
        "/api/v1/ai/recommend", json={"query": "", "latitude": 6.5, "longitude": 3.3}
    )
    assert response.status_code == 422
    # Query longer than the 300-character cap.
    response = await portable_client.post(
        "/api/v1/ai/recommend",
        json={"query": "x" * 301, "latitude": 6.5, "longitude": 3.3},
    )
    assert response.status_code == 422
    # Out-of-range coordinates.
    response = await portable_client.post(
        "/api/v1/ai/recommend", json={"query": "petrol", "latitude": 91.0, "longitude": 3.3}
    )
    assert response.status_code == 422
    response = await portable_client.post(
        "/api/v1/ai/recommend", json={"query": "petrol", "latitude": 6.5, "longitude": 181.0}
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# Failure handling
# --------------------------------------------------------------------------- #
async def test_recommend_survives_ai_timeout(portable_client, monkeypatch) -> None:
    await seed_catalogue(
        portable_client,
        stations=[{"name": "Survivor Co", "lat": REQUEST_LAT + 0.01, "lon": REQUEST_LON}],
    )
    monkeypatch.setattr(
        "app.services.stations.find_nearby", make_portable_find_nearby()
    )

    def _timeout(*args, **kwargs):
        raise TimeoutError("AI provider timed out")

    monkeypatch.setattr(recommend, "parse_recommend_intent", _timeout)
    monkeypatch.setattr(recommend, "generate_explanation", _timeout)

    response = await portable_client.post(
        "/api/v1/ai/recommend", json=_recommend_payload("closest petrol")
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["intent_source"] == "fallback"
    assert body["answer_source"] == "fallback"
    assert body["intent"]["fuel_type"] == "PMS"
    assert body["intent"]["sort_preference"] == "distance"
    assert body["recommendations"]


async def test_recommend_database_failure_is_clean_503_and_stations_unaffected(
    portable_client, monkeypatch
) -> None:
    await seed_catalogue(
        portable_client,
        stations=[{"name": "Any Co", "lat": REQUEST_LAT + 0.01, "lon": REQUEST_LON}],
    )

    async def _boom(*args, **kwargs):
        raise RuntimeError("database exploded")

    monkeypatch.setattr("app.services.stations.find_nearby", _boom)

    response = await portable_client.post(
        "/api/v1/ai/recommend", json=_recommend_payload("petrol")
    )
    assert response.status_code == 503

    # The normal public API keeps working after the AI failure.
    reports = await portable_client.get("/api/v1/reports")
    assert reports.status_code == 200


async def test_recommend_runs_against_real_seed_catalogue(portable_client, monkeypatch) -> None:
    """The full pipeline against the REAL 176-station seed catalogue (the same
    data production serves) plus real fuel-report rows for nearby stations."""
    from app.scripts.seed_data import STATIONS
    from app.scripts.seed_data.fuel_types import FUEL_TYPES

    origin = {"lat": 6.6018, "lon": 3.3515}  # Ikeja (real seed coordinates)

    ids: dict[str, uuid.UUID] = {}
    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        for spec in FUEL_TYPES:
            session.add(
                FuelType(
                    code=spec["code"],
                    name=spec["name"],
                    description=spec.get("description"),
                    is_active=spec.get("is_active", True),
                )
            )
        user_id = uuid.uuid4()
        session.add(
            User(id=user_id, email=f"{uuid.uuid4().hex}@example.com", is_active=True)
        )
        for spec in STATIONS:
            station_id = uuid.uuid4()
            ids[spec["name"]] = station_id
            session.add(
                FuelStation(
                    id=station_id,
                    name=spec["name"],
                    brand=spec.get("brand"),
                    address=spec.get("address"),
                    city=spec.get("city"),
                    state=spec.get("state"),
                    location=portable_location_wkt(spec["latitude"], spec["longitude"]),
                    is_active=True,
                )
            )
            for code in spec["fuel_types"]:
                session.add(
                    FuelStationFuelType(station_id=station_id, fuel_type_code=code)
                )

        # The three nearest PMS stations to Ikeja, from the real catalogue.
        with_pms = [
            spec for spec in STATIONS if "PMS" in spec.get("fuel_types", [])
        ]
        near = sorted(
            with_pms,
            key=lambda spec: _haversine_m(
                origin["lat"], origin["lon"], spec["latitude"], spec["longitude"]
            ),
        )[:3]
        assert len(near) == 3
        # Realistic price reports: cheapest on the second-nearest, pricier on
        # the nearest — "cheapest petrol" must pick the cheaper one.
        session.add(
            FuelReport(
                id=uuid.uuid4(),
                station_id=ids[near[0]["name"]],
                user_id=user_id,
                fuel_type_code="PMS",
                price_per_litre=950,
                status=ReportStatus.VERIFIED,
                created_at=NOW - timedelta(days=1),
            )
        )
        session.add(
            FuelReport(
                id=uuid.uuid4(),
                station_id=ids[near[1]["name"]],
                user_id=user_id,
                fuel_type_code="PMS",
                price_per_litre=850,
                status=ReportStatus.VERIFIED,
                created_at=NOW - timedelta(days=1),
            )
        )
        await session.commit()

    monkeypatch.setattr(
        "app.services.stations.find_nearby", make_portable_find_nearby()
    )

    response = await portable_client.post(
        "/api/v1/ai/recommend",
        json=_recommend_payload(
            "Find the cheapest petrol near me", origin["lat"], origin["lon"]
        ),
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["intent"]["fuel_type"] == "PMS"
    assert body["intent"]["sort_preference"] == "price"
    assert len(body["recommendations"]) >= 2
    top = body["recommendations"][0]
    # The cheaper reported price wins, from real catalogue rows.
    assert top["station"]["name"] == near[1]["name"]
    assert top["latest_price"] == 850
    # Every recommended station is a real catalogue row with honest provenance.
    for rec in body["recommendations"]:
        station = rec["station"]
        assert station["data_source"] == "seed"
        assert station["verification_status"] == "unverified"


async def test_recommend_provides_strong_options_message(portable_client, monkeypatch) -> None:
    await seed_catalogue(
        portable_client,
        stations=[
            {"name": "Alpha Co", "lat": REQUEST_LAT + 0.01, "lon": REQUEST_LON},
            {"name": "Beta Co", "lat": REQUEST_LAT + 0.01, "lon": REQUEST_LON},
        ],
        reports=[
            {"station": "Alpha Co", "price": 900},
            {"station": "Beta Co", "price": 900},
        ],
    )
    monkeypatch.setattr(
        "app.services.stations.find_nearby", make_portable_find_nearby()
    )
    response = await portable_client.post(
        "/api/v1/ai/recommend", json=_recommend_payload("best petrol station")
    )
    body = response.json()
    assert len(body["recommendations"]) == 2
    # Equally strong -> the answer says so instead of crowning a winner.
    assert "strong options" in body["answer"]


# --------------------------------------------------------------------------- #
# No invented coordinates anywhere in the new code
# --------------------------------------------------------------------------- #
def test_no_hardcoded_fallback_coordinates_in_ai_code() -> None:
    """Regression guard: the AI layer must never embed city fallbacks."""
    import inspect

    from app.api.v1 import ai as ai_api
    from app.services.ai import recommend as recommend_module

    for module in (ai_api, recommend_module):
        source = inspect.getsource(module)
        assert "Abuja" not in source
        assert "Kaduna" not in source
        assert not re.search(r"\b9\.05\d\d\b", source)  # Abuja lat
        assert not re.search(r"\b10\.52\d\d\b", source)  # Kaduna lat
