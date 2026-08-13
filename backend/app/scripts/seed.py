"""
Seed the database with Nigerian fuel types and a representative catalogue of
fuel stations across all 36 states + FCT.

Designed to be **idempotent**: re-running it updates existing rows in place
rather than creating duplicates. The natural key is the ``(name, city)`` pair
already enforced by the ``uq_fuel_stations_name_city`` unique constraint, so
upsert semantics fall out naturally.

It is invoked as a module so that the ``app`` package and project settings
resolve correctly:

    cd backend
    python -m app.scripts.seed            # upsert seed data
    python -m app.scripts.seed --reset    # wipe then re-insert (dev only)
    python -m app.scripts.seed --diagnose # print health/diagnostic summary

The seed uses the *synchronous* engine/session (see ``app.core.database``)
because seeding is a batch, blocking task — no need for the async machinery
that serves live API traffic.

**Demo-data notice.** The nationwide catalogue in
:mod:`app.scripts.seed_data.nationwide` is **synthetic** and clearly labelled
with a ``(Demo)`` name suffix. It is intended to give the application
realistic nationwide coverage for the nearby-search demo and is **not** a
verified directory of real-world businesses. The original 15 Lagos + 3 FCT
records (kept verbatim) are real-seed rows that the production database
already contains; they are preserved here for backward compatibility and
upsert idempotency.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from typing import Any

from geoalchemy2.elements import WKTElement
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models import (
    FuelStation,
    FuelStationFuelType,
    FuelType,
    StationDataSource,
    StationVerificationStatus,
)

# Re-export public seed-data symbols so callers (CLI, tests) keep importing
# them from this module: `from app.scripts.seed import FUEL_TYPES, STATIONS`.
from app.scripts.seed_data import STATIONS as STATIONS  # noqa: E402
from app.scripts.seed_data import LAGOS_FCT_STATIONS  # noqa: E402,F401
from app.scripts.seed_data import NATIONWIDE_STATIONS  # noqa: E402,F401
from app.scripts.seed_data.fuel_types import FUEL_TYPES  # noqa: E402

# --------------------------------------------------------------------------- #
# Geometry helper
# --------------------------------------------------------------------------- #
def _to_geography(latitude: float, longitude: float) -> WKTElement:
    """Build a WGS-84 geography point (WKT is lon/lat ordered)."""
    return WKTElement(f"POINT({longitude} {latitude})", srid=4326)


# --------------------------------------------------------------------------- #
# Persistence helpers
# --------------------------------------------------------------------------- #
def _reset_catalogue(session: Session) -> None:
    """Delete all seeded rows. Order respects FK cascades."""
    session.execute(delete(FuelStationFuelType))
    session.execute(delete(FuelStation))
    session.execute(delete(FuelType))
    session.flush()


def seed_fuel_types(session: Session) -> int:
    """Upsert the canonical fuel-type catalogue, returning rows touched."""
    for ft in FUEL_TYPES:
        existing = session.get(FuelType, ft["code"])
        if existing is None:
            session.add(FuelType(**ft))  # type: ignore[arg-type]
        else:
            existing.name = ft["name"]  # type: ignore[assignment]
            existing.description = ft["description"]  # type: ignore[assignment]
            existing.is_active = True
    session.flush()
    return len(FUEL_TYPES)


def seed_stations(session: Session) -> int:
    """Upsert the station catalogue and their fuel offerings."""
    for spec in STATIONS:
        station = session.scalars(
            select(FuelStation).where(
                FuelStation.name == spec["name"],
                FuelStation.city == spec["city"],
            )
        ).first()

        location = _to_geography(spec["latitude"], spec["longitude"])

        if station is None:
            station = FuelStation(
                name=spec["name"],
                brand=spec["brand"],
                address=spec["address"],
                city=spec["city"],
                state=spec["state"],
                location=location,
                is_active=True,
                # The whole built-in catalogue is demo/seed data: it is never
                # presented as an independently verified live registry.
                data_source=StationDataSource.SEED,
                verification_status=StationVerificationStatus.UNVERIFIED,
            )
            session.add(station)
        else:
            station.brand = spec["brand"]
            station.address = spec["address"]
            station.state = spec["state"]
            station.location = location
            station.is_active = True
            # Idempotent re-seed keeps provenance honest: re-running the seed
            # must never silently upgrade rows to verified/official.
            station.data_source = StationDataSource.SEED
            station.verification_status = StationVerificationStatus.UNVERIFIED

        session.flush()  # ensure station.id is populated
        _sync_fuel_type_links(session, station, spec["fuel_types"])

    return len(STATIONS)


def _sync_fuel_type_links(session: Session, station: FuelStation, codes: list[str]) -> None:
    """Rebuild a station's fuel-type links to match the spec exactly."""
    session.execute(
        delete(FuelStationFuelType).where(
            FuelStationFuelType.station_id == station.id
        )
    )
    for code in codes:
        session.add(
            FuelStationFuelType(station_id=station.id, fuel_type_code=code)
        )
    session.flush()


# --------------------------------------------------------------------------- #
# Diagnostic / health check
# --------------------------------------------------------------------------- #
def collect_diagnostics(session: Session) -> dict[str, Any]:
    """Read-only database health check for the fuel-station catalogue.

    Returns a dict useful both for ad-hoc CLI diagnostics and for the
    `GET /api/v1/admin/diagnostics`-style health endpoints. Never modifies
    the database.

    Computed via plain SQL aggregates so the function works against any
    engine that supports the ``fuel_stations`` table (Postgres with PostGIS
    in production, SQLite in tests).
    """
    total = int(
        session.execute(select(func.count(FuelStation.id))).scalar_one()
    )
    active = int(
        session.execute(
            select(func.count(FuelStation.id)).where(FuelStation.is_active.is_(True))
        ).scalar_one()
    )

    state_rows = session.execute(
        select(FuelStation.state, func.count(FuelStation.id)).group_by(
            FuelStation.state
        )
    ).all()
    city_rows = session.execute(
        select(FuelStation.city, func.count(FuelStation.id)).group_by(
            FuelStation.city
        )
    ).all()

    return {
        "total_stations": total,
        "active_stations": active,
        "states_covered": len(state_rows),
        "cities_covered": len(city_rows),
        "states": sorted(s for (s, _) in state_rows if s is not None),
        "cities": sorted(c for (c, _) in city_rows if c is not None),
        "stations_per_state": dict(
            (s, c) for (s, c) in state_rows if s is not None
        ),
        "stations_per_city": dict(
            (c, n) for (c, n) in city_rows if c is not None
        ),
    }


def print_diagnostics(diag: dict[str, Any]) -> None:
    """Pretty-print the diagnostic report to stdout."""
    print("── Fuel Station Diagnostics ─────────────────────────────")
    print(f"  Total stations : {diag['total_stations']}")
    print(f"  Active stations: {diag['active_stations']}")
    print(f"  States covered : {diag['states_covered']}")
    print(f"  Cities covered : {diag['cities_covered']}")
    print()
    print("  Per-state breakdown:")
    states = diag["states"]
    per_state = diag["stations_per_state"]
    for s in states:
        print(f"    {s:<20} {per_state.get(s, 0):>4} station(s)")
    print()
    # Print the 10 most-covered cities as a quick spot check.
    per_city = diag["stations_per_city"]
    top_cities = Counter(per_city).most_common(10)
    print("  Top 10 cities by station count:")
    for c, n in top_cities:
        print(f"    {c:<25} {n:>3} station(s)")
    print("────────────────────────────────────────────────────────")


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def run(reset: bool = False) -> dict[str, int]:
    """Run the seed inside a single transaction; commit only on success."""
    with SessionLocal() as session:
        if reset:
            _reset_catalogue(session)
        fuel_type_count = seed_fuel_types(session)
        station_count = seed_stations(session)
        link_count = sum(len(spec["fuel_types"]) for spec in STATIONS)
        session.commit()

    return {
        "fuel_types": fuel_type_count,
        "stations": station_count,
        "fuel_type_links": link_count,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Seed the Fuel Station Finder AI database with Nigerian fuel "
            "types and stations across all 36 states + FCT."
        ),
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing seed rows before re-inserting (development use).",
    )
    parser.add_argument(
        "--diagnose",
        action="store_true",
        help=(
            "Print a health/diagnostic summary (total/active station counts, "
            "states and cities covered) without modifying the database."
        ),
    )
    args = parser.parse_args(argv)

    if args.reset and not args.diagnose:
        print("⚠️  Reset requested: wiping fuel types, stations and links...")

    if args.diagnose:
        with SessionLocal() as session:
            diag = collect_diagnostics(session)
        print_diagnostics(diag)
        return 0

    try:
        summary = run(reset=args.reset)
    except Exception as exc:  # noqa: BLE001 - surface a clean CLI error
        print(f"✖ Seeding failed: {exc}", file=sys.stderr)
        return 1

    print(
        "✔ Seed complete: "
        f"{summary['fuel_types']} fuel types, "
        f"{summary['stations']} stations, "
        f"{summary['fuel_type_links']} station<->fuel links."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
