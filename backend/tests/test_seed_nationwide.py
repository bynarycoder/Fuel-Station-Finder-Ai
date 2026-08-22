"""
Tests for the expanded nationwide seed dataset.

These validate the *structure and content* of the seed catalogue after the
36-states + FCT expansion. They are pure-Python (no database, no mocks), so
they run quickly and deterministically alongside the rest of the suite.

Coverage:
* every state in Nigeria (36 + FCT) has at least one station;
* every station's coordinates fall inside a generous Nigeria bounding box;
* lon/lat order is preserved in the WKT helper (regression test);
* the original 18 Lagos/FCT records are kept verbatim;
* the new nationwide records are clearly labelled as demo data;
* ``Kaduna`` has at least 4 stations within 5 km of (10.5207, 7.4386)
  (the documented nearby-search success criteria);
* the seed is **idempotent at the data layer** — the catalogue contains no
  duplicate ``(name, city)`` pairs, the natural key used by the upsert path;
* the diagnostic helper reports sensible totals on an in-memory SQLite DB;
* the diagnostic health check works against a live seeded session and counts
  correctly after idempotent re-seeding.
"""

from __future__ import annotations

import importlib

import pytest
from geoalchemy2.elements import WKTElement
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models import FuelStation
from app.scripts import seed as seed_module
from app.scripts.seed import (
    FUEL_TYPES,
    STATIONS,
    _to_geography,
    collect_diagnostics,
    seed_fuel_types,
    seed_stations,
)
from app.scripts.seed_data import LAGOS_FCT_STATIONS, NATIONWIDE_STATIONS

# The 36 Nigerian states + FCT.
NIGERIAN_STATES = {
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
    "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti",
    "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
    "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo",
    "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
}

# Generous bounding box for mainland Nigeria (lat/lon, decimal degrees).
NIGERIA_LAT_RANGE = (4.0, 14.0)
NIGERIA_LON_RANGE = (2.5, 15.0)

# (Haversine — same formula the app uses in `frontend/src/lib/format.ts`.)
from math import asin, cos, radians, sin, sqrt  # noqa: E402


def _haversine_m(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    """Distance in metres between two WGS-84 points (haversine)."""
    r = 6371000.0
    dlat = radians(b_lat - a_lat)
    dlon = radians(b_lon - a_lon)
    h = (
        sin(dlat / 2) ** 2
        + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(dlon / 2) ** 2
    )
    return 2 * r * asin(sqrt(h))


# --------------------------------------------------------------------------- #
# Coverage of Nigerian states
# --------------------------------------------------------------------------- #
def test_seed_covers_all_thirty_six_states_plus_fct() -> None:
    """Every Nigerian state and the FCT must be represented in the catalogue."""
    covered = {s["state"] for s in STATIONS}
    missing = NIGERIAN_STATES - covered
    assert not missing, f"Missing states in seed: {sorted(missing)}"


def test_seed_targets_at_least_one_hundred_fifty_stations() -> None:
    """The brief targets 150–300 seed stations."""
    assert 150 <= len(STATIONS) <= 300, len(STATIONS)


def test_seed_distribution_is_not_lagos_only() -> None:
    """Lagos must not be >50% of the catalogue (the brief asks for nationwide)."""
    lagos_count = sum(1 for s in STATIONS if s["state"] == "Lagos")
    assert lagos_count < len(STATIONS) * 0.5, (
        f"Lagos still dominates: {lagos_count}/{len(STATIONS)}"
    )


def test_seed_includes_priority_north_cities() -> None:
    """Brief §3 priority: Kaduna, Kano, Katsina, Zaria, Jos, Abuja/FCT, Sokoto,
    Maiduguri, Bauchi, Gombe, Minna must all have at least one station.
    """
    required = {
        "Kaduna", "Kano", "Katsina", "Zaria", "Jos", "Sokoto", "Maiduguri",
        "Bauchi", "Gombe", "Minna",
    }
    present = {s["city"] for s in STATIONS}
    missing = required - present
    assert not missing, f"Missing priority N cities: {sorted(missing)}"
    # Abuja/FCT is represented by FCT state with multiple district cities.
    fct_stations = [s for s in STATIONS if s["state"] == "FCT"]
    assert fct_stations, "FCT/Abuja must have at least one station"


def test_seed_includes_priority_south_west_cities() -> None:
    # Lagos is represented by district-level cities (Ikeja, Lekki, Yaba, …)
    # under the "Lagos" state. The brief groups these as a single hub.
    required_city_names = {
        "Ibadan", "Abeokuta", "Akure", "Osogbo", "Ilorin", "Ado-Ekiti",
    }
    present = {s["city"] for s in STATIONS}
    missing = required_city_names - present
    assert not missing, f"Missing priority SW cities: {sorted(missing)}"
    # Lagos state must have multiple stations to count as a hub.
    lagos_stations = [s for s in STATIONS if s["state"] == "Lagos"]
    assert len(lagos_stations) >= 2, (
        f"Lagos state should have multiple stations, got {len(lagos_stations)}"
    )


def test_seed_includes_priority_south_east_cities() -> None:
    required = {"Enugu", "Onitsha", "Awka", "Aba", "Owerri", "Umuahia"}
    present = {s["city"] for s in STATIONS}
    missing = required - present
    assert not missing, f"Missing priority SE cities: {sorted(missing)}"


def test_seed_includes_priority_south_south_cities() -> None:
    required = {
        "Port Harcourt", "Benin City", "Warri", "Asaba", "Uyo", "Calabar",
        "Yenagoa",
    }
    present = {s["city"] for s in STATIONS}
    missing = required - present
    assert not missing, f"Missing priority SS cities: {sorted(missing)}"


# --------------------------------------------------------------------------- #
# Demo data labelling
# --------------------------------------------------------------------------- #
def test_nationwide_records_carry_demo_suffix() -> None:
    """New nationwide records must be clearly labelled as demo seed data so we
    do not falsely present them as verified real-world businesses."""
    for s in NATIONWIDE_STATIONS:
        assert "(Demo)" in s["name"], (
            f"Nationwide station {s['name']!r} is missing a '(Demo)' suffix"
        )


def test_original_lagos_fct_records_are_preserved_verbatim() -> None:
    """The 18 production records must not be modified — they already exist in
    the production database and changing their natural key would break the
    upsert idempotency.
    """
    # Spot-check 3 well-known entries.
    by_key = {(s["name"], s["city"]): s for s in LAGOS_FCT_STATIONS}
    for name, city, lat, lon in [
        ("NNPC Retail Ikeja", "Ikeja", 6.6018, 3.3515),
        ("Mobil Lekki Phase 1", "Lekki", 6.4474, 3.4688),
        ("Oando Maitama", "Maitama", 9.0900, 7.4900),
    ]:
        s = by_key[(name, city)]
        assert s["latitude"] == lat
        assert s["longitude"] == lon


# --------------------------------------------------------------------------- #
# Coordinate validity + lon/lat order
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "station", STATIONS, ids=lambda s: f"{s['name']}|{s['city']}"
)
def test_every_station_is_in_nigeria_bounding_box(station: dict) -> None:
    lat, lon = station["latitude"], station["longitude"]
    assert NIGERIA_LAT_RANGE[0] <= lat <= NIGERIA_LAT_RANGE[1], station
    assert NIGERIA_LON_RANGE[0] <= lon <= NIGERIA_LON_RANGE[1], station


def test_to_geography_uses_lon_lat_order() -> None:
    """Regression: the WKT point must be ``POINT(longitude latitude)``."""
    point = _to_geography(latitude=10.5207, longitude=7.4386)
    assert isinstance(point, WKTElement)
    assert point.srid == 4326
    # WKT is longitude-first
    assert "POINT(7.4386 10.5207)" in str(point)


# --------------------------------------------------------------------------- #
# Stations spread around major cities (not just one point per city)
# --------------------------------------------------------------------------- #
def test_major_cities_have_multiple_stations() -> None:
    """Brief §5: "Put multiple stations around different major areas/localities
    within important cities". Major hubs should have >= 2 stations each.
    """
    by_city: dict[str, int] = {}
    for s in STATIONS:
        by_city[s["city"]] = by_city.get(s["city"], 0) + 1
    # Lagos is split into district-level cities under the "Lagos" state.
    lagos_count = sum(1 for s in STATIONS if s["state"] == "Lagos")
    fct_count = sum(1 for s in STATIONS if s["state"] == "FCT")
    must_be_plural: list[tuple[str, int]] = [
        ("Lagos (state)", lagos_count),
        ("Abuja/FCT (state)", fct_count),
        ("Kaduna", by_city.get("Kaduna", 0)),
        ("Kano", by_city.get("Kano", 0)),
        ("Ibadan", by_city.get("Ibadan", 0)),
        ("Port Harcourt", by_city.get("Port Harcourt", 0)),
        ("Benin City", by_city.get("Benin City", 0)),
        ("Owerri", by_city.get("Owerri", 0)),
        ("Aba", by_city.get("Aba", 0)),
        ("Onitsha", by_city.get("Onitsha", 0)),
    ]
    for label, count in must_be_plural:
        assert count >= 2, f"{label} has only {count} station(s)"


# --------------------------------------------------------------------------- #
# Kaduna nearby-search success criteria
# --------------------------------------------------------------------------- #
def test_kaduna_has_stations_within_5km_of_documented_point() -> None:
    """The success-criteria point: a user at (10.5207, 7.4386) with
    radius_meters=5000 must receive nearby stations.
    """
    within: list[dict] = []
    for s in STATIONS:
        if s["city"] != "Kaduna":
            continue
        d = _haversine_m(
            10.5207, 7.4386, s["latitude"], s["longitude"]
        )
        if d <= 5000:
            within.append(s)
    assert len(within) >= 4, (
        f"Expected ≥4 Kaduna stations within 5 km, got {len(within)}: "
        f"{[s['name'] for s in within]}"
    )


# --------------------------------------------------------------------------- #
# Idempotency at the data layer
# --------------------------------------------------------------------------- #
def test_no_duplicate_name_city_pairs_in_catalogue() -> None:
    """The unique key the seed uses for upsert is ``(name, city)`` — the
    catalogue itself must be free of duplicates so re-running never tries to
    insert the same row twice in the same transaction.
    """
    seen: set[tuple[str, str]] = set()
    for s in STATIONS:
        key = (s["name"], s["city"])
        assert key not in seen, f"Duplicate (name, city) in catalogue: {key}"
        seen.add(key)


def test_every_station_has_required_metadata() -> None:
    required = {
        "name", "brand", "address", "city", "state", "latitude", "longitude",
        "fuel_types",
    }
    for s in STATIONS:
        missing = required - s.keys()
        assert not missing, f"{s.get('name')!r} is missing keys: {missing}"
        # `is_active` is a server-side default in the seed; the catalogue
        # itself does not need to carry the key. If it does, it must be True.
        if "is_active" in s:
            assert s["is_active"] is True, s


def test_every_station_is_active_in_catalogue() -> None:
    """Spec: every station must have is_active=True. The seed normalises
    this server-side, so the catalogue itself should not carry the field as
    ``False``."""
    for s in STATIONS:
        if "is_active" in s:
            assert s["is_active"] is True, s


# --------------------------------------------------------------------------- #
# Diagnostic / health check (in-memory SQLite, no PostGIS needed)
# --------------------------------------------------------------------------- #
@pytest.fixture
def sqlite_session():
    """Yield a synchronous SQLAlchemy session backed by an in-memory SQLite
    DB with the same scalar schema as ``fuel_stations`` / ``fuel_types`` /
    ``fuel_station_fuel_types`` (the PostGIS ``location`` column becomes a
    portable ``LargeBinary``).

    The diagnostic aggregates only read scalar columns, so the geography
    column is never queried. We bypass the ORM models for inserts (the
    ``Geography`` type emits ``AsBinary(...)`` SQL that SQLite cannot run);
    the ``collect_diagnostics`` function reads through the ORM models
    because that is its production path.
    """
    import uuid

    from sqlalchemy import Boolean, Column, LargeBinary, MetaData, String, Table
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.schema import UniqueConstraint

    portable_meta = MetaData()
    portable_fuel_stations = Table(
        "fuel_stations", portable_meta,
        Column("id", String(36), primary_key=True),
        Column("name", String(200), nullable=False),
        Column("brand", String(100)),
        Column("address", String(255)),
        Column("city", String(100)),
        Column("state", String(100)),
        Column("phone", String(40)),
        # PostGIS geography → portable LargeBinary for SQLite.
        Column("location", LargeBinary, nullable=False),
        Column("is_active", Boolean, default=True, nullable=False),
        Column("created_at", String(32)),
        Column("updated_at", String(32)),
        # Match the production unique constraint so ``ON CONFLICT(name, city)``
        # works exactly the same way on SQLite as it does on Postgres.
        UniqueConstraint("name", "city", name="uq_fuel_stations_name_city"),
    )
    portable_fuel_types = Table(
        "fuel_types", portable_meta,
        Column("code", String(8), primary_key=True),
        Column("name", String(100), nullable=False),
        Column("description", String(500)),
        Column("is_active", Boolean, default=True, nullable=False),
        Column("created_at", String(32)),
        Column("updated_at", String(32)),
    )
    portable_links = Table(
        "fuel_station_fuel_types", portable_meta,
        Column("station_id", String(36), primary_key=True),
        Column("fuel_type_code", String(8), primary_key=True),
        Column("created_at", String(32)),
        Column("updated_at", String(32)),
    )

    engine = create_engine("sqlite:///:memory:")
    portable_meta.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = factory()

    # Bind the ORM models to the portable tables so ``collect_diagnostics``
    # can use them without touching PostGIS. This is a per-test rebind
    # that we restore on teardown. Inserts go through the portable Table
    # objects (not the ORM) to bypass the ``AsBinary(location)`` SQL that
    # GeoAlchemy2 emits for the geography column type.
    from app.models import fuel_station as _fs_module
    from app.models import fuel_station_fuel_type as _fsft_module
    from app.models import fuel_type as _ft_module

    saved = {
        "FuelStation.__table__": _fs_module.FuelStation.__table__,
        "FuelStationFuelType.__table__": _fsft_module.FuelStationFuelType.__table__,
        "FuelType.__table__": _ft_module.FuelType.__table__,
    }
    _fs_module.FuelStation.__table__ = portable_fuel_stations  # type: ignore[assignment]
    _fsft_module.FuelStationFuelType.__table__ = portable_links  # type: ignore[assignment]
    _ft_module.FuelType.__table__ = portable_fuel_types  # type: ignore[assignment]
    # Keep references on the *actual session* (not the local fixture name)
    # so tests that consume the fixture can find them.
    session._portable_fuel_stations = portable_fuel_stations  # type: ignore[attr-defined]
    session._portable_fuel_types = portable_fuel_types  # type: ignore[attr-defined]
    session._portable_links = portable_links  # type: ignore[attr-defined]
    session._new_id = lambda: str(uuid.uuid4())  # type: ignore[attr-defined]
    try:
        yield session
    finally:
        _fs_module.FuelStation.__table__ = saved["FuelStation.__table__"]  # type: ignore[assignment]
        _fsft_module.FuelStationFuelType.__table__ = saved["FuelStationFuelType.__table__"]  # type: ignore[assignment]
        _ft_module.FuelType.__table__ = saved["FuelType.__table__"]  # type: ignore[assignment]
        session.close()
        engine.dispose()


def test_diagnostics_reports_zero_when_empty(sqlite_session) -> None:
    diag = collect_diagnostics(sqlite_session)
    assert diag["total_stations"] == 0
    assert diag["active_stations"] == 0
    assert diag["states_covered"] == 0
    assert diag["cities_covered"] == 0


def _bulk_insert_seed(sqlite_session) -> int:
    """Insert the full seed catalogue directly via the portable Table objects.

    We bypass the ORM here because the ``Geography`` type emits
    ``AsBinary(location)`` SQL that SQLite cannot run; the production seed
    path goes through PostGIS so this is a test-only shortcut.
    Returns the number of station rows inserted.
    """
    new_id = sqlite_session._new_id  # type: ignore[attr-defined]
    stations_tbl = sqlite_session._portable_fuel_stations  # type: ignore[attr-defined]
    types_tbl = sqlite_session._portable_fuel_types  # type: ignore[attr-defined]
    links_tbl = sqlite_session._portable_links  # type: ignore[attr-defined]

    # 1) Fuel types
    for ft in FUEL_TYPES:
        sqlite_session.execute(types_tbl.insert().values(
            code=ft["code"],
            name=ft["name"],
            description=ft["description"],
            is_active=True,
            created_at="2026-01-01 00:00:00",
            updated_at="2026-01-01 00:00:00",
        ))
    # 2) Stations + links
    for s in STATIONS:
        sid = new_id()
        sqlite_session.execute(stations_tbl.insert().values(
            id=sid,
            name=s["name"],
            brand=s["brand"],
            address=s["address"],
            city=s["city"],
            state=s["state"],
            phone=None,
            location=b"\x00",  # placeholder blob
            is_active=True,
            created_at="2026-01-01 00:00:00",
            updated_at="2026-01-01 00:00:00",
        ))
        for code in s["fuel_types"]:
            sqlite_session.execute(links_tbl.insert().values(
                station_id=sid,
                fuel_type_code=code,
                created_at="2026-01-01 00:00:00",
                updated_at="2026-01-01 00:00:00",
            ))
    sqlite_session.commit()
    return len(STATIONS)


def test_diagnostics_after_seeding_reports_full_coverage(sqlite_session) -> None:
    """The health check should reflect exactly what the seed inserts."""
    n = _bulk_insert_seed(sqlite_session)
    assert n == len(STATIONS)

    diag = collect_diagnostics(sqlite_session)
    assert diag["total_stations"] == len(STATIONS)
    assert diag["active_stations"] == len(STATIONS)
    assert diag["states_covered"] == len(NIGERIAN_STATES)
    assert diag["cities_covered"] >= 100
    # Every Nigerian state must be reported as covered.
    assert set(diag["states"]) == NIGERIAN_STATES


def test_seed_is_idempotent_against_live_session(sqlite_session) -> None:
    """Re-running the seed must not multiply rows. This is the canonical
    'safe to re-run' guarantee the brief asks for.

    We simulate the production upsert at the SQL level: ``INSERT … ON
    CONFLICT(name, city) DO UPDATE`` is what the natural key (``uq_fuel_
    stations_name_city``) would do in Postgres. Because SQLite supports
    the same ``ON CONFLICT`` clause, we can verify the same invariant
    here without standing up PostGIS.
    """
    stations_tbl = sqlite_session._portable_fuel_stations  # type: ignore[attr-defined]
    types_tbl = sqlite_session._portable_fuel_types  # type: ignore[attr-defined]
    links_tbl = sqlite_session._portable_links  # type: ignore[attr-defined]
    new_id = sqlite_session._new_id  # type: ignore[attr-defined]

    insert_station_sql = text(
        "INSERT INTO fuel_stations "
        "(id, name, brand, address, city, state, phone, location, is_active, "
        " created_at, updated_at) "
        "VALUES (:id, :name, :brand, :address, :city, :state, :phone, "
        " :location, :is_active, :created_at, :updated_at) "
        "ON CONFLICT(name, city) DO UPDATE SET "
        " brand=excluded.brand, address=excluded.address, state=excluded.state, "
        " is_active=excluded.is_active, updated_at=excluded.updated_at"
    )
    insert_type_sql = text(
        "INSERT INTO fuel_types "
        "(code, name, description, is_active, created_at, updated_at) "
        "VALUES (:code, :name, :description, :is_active, :created_at, :updated_at) "
        "ON CONFLICT(code) DO UPDATE SET "
        " name=excluded.name, description=excluded.description, "
        " is_active=excluded.is_active, updated_at=excluded.updated_at"
    )

    def _run_seed() -> None:
        for ft in FUEL_TYPES:
            sqlite_session.execute(
                insert_type_sql,
                {
                    "code": ft["code"],
                    "name": ft["name"],
                    "description": ft["description"],
                    "is_active": True,
                    "created_at": "2026-01-01 00:00:00",
                    "updated_at": "2026-01-01 00:00:00",
                },
            )
        for s in STATIONS:
            sid = new_id()
            sqlite_session.execute(
                insert_station_sql,
                {
                    "id": sid,
                    "name": s["name"],
                    "brand": s["brand"],
                    "address": s["address"],
                    "city": s["city"],
                    "state": s["state"],
                    "phone": None,
                    "location": b"\x00",
                    "is_active": True,
                    "created_at": "2026-01-01 00:00:00",
                    "updated_at": "2026-01-01 00:00:00",
                },
            )
        sqlite_session.commit()

    # First run seeds the database.
    _run_seed()
    first_total = sqlite_session.execute(
        text("SELECT COUNT(*) FROM fuel_stations")
    ).scalar()
    first_states = sqlite_session.execute(
        text("SELECT COUNT(DISTINCT state) FROM fuel_stations")
    ).scalar()

    # Second run MUST NOT multiply rows.
    _run_seed()
    second_total = sqlite_session.execute(
        text("SELECT COUNT(*) FROM fuel_stations")
    ).scalar()
    second_states = sqlite_session.execute(
        text("SELECT COUNT(DISTINCT state) FROM fuel_stations")
    ).scalar()

    assert first_total == second_total == len(STATIONS), (
        f"Idempotency broken: first={first_total}, second={second_total}, "
        f"catalogue={len(STATIONS)}"
    )
    assert first_states == second_states == len(NIGERIAN_STATES)


# --------------------------------------------------------------------------- #
# Public re-exports — keeps the test in sync with the module's surface area
# --------------------------------------------------------------------------- #
def test_seed_module_reexports_fuel_types_and_stations() -> None:
    # Force a re-import to catch accidental removal of the re-export lines.
    importlib.reload(seed_module)
    assert seed_module.FUEL_TYPES == FUEL_TYPES
    assert seed_module.STATIONS == STATIONS
