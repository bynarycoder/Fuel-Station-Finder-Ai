"""
Seed the database with Nigerian fuel types and a representative catalogue of
fuel stations across Lagos and the FCT (Abuja).

Designed to be **idempotent**: re-running it updates existing rows in place
rather than creating duplicates. It is invoked as a module so that the
``app`` package and project settings resolve correctly:

    cd backend
    python -m app.scripts.seed            # upsert seed data
    python -m app.scripts.seed --reset    # wipe then re-insert (dev only)

The seed uses the *synchronous* engine/session (see ``app.core.database``)
because seeding is a batch, blocking task — no need for the async machinery
that serves live API traffic.
"""

from __future__ import annotations

import argparse
import sys

from geoalchemy2.elements import WKTElement
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models import FuelStation, FuelStationFuelType, FuelType

# --------------------------------------------------------------------------- #
# Reference data: canonical Nigerian petroleum products.
# --------------------------------------------------------------------------- #
FUEL_TYPES: list[dict[str, str | bool]] = [
    {
        "code": "PMS",
        "name": "Premium Motor Spirit",
        "description": "Petrol — the primary fuel for most passenger vehicles in Nigeria.",
        "is_active": True,
    },
    {
        "code": "AGO",
        "name": "Automotive Gas Oil",
        "description": "Diesel — used by heavy-duty vehicles, commercial transport and generators.",
        "is_active": True,
    },
    {
        "code": "DPK",
        "name": "Dual Purpose Kerosene",
        "description": "Household Kerosene (HHK) — used for cooking stoves and lighting.",
        "is_active": True,
    },
    {
        "code": "LPG",
        "name": "Liquefied Petroleum Gas",
        "description": "Cooking Gas — increasingly retailed at modern filling stations.",
        "is_active": True,
    },
]


# --------------------------------------------------------------------------- #
# Catalogue data: representative Nigerian filling stations.
#
# Coordinates are approximate, drawn from well-known neighbourhoods so that the
# dataset is geographically realistic for nearby-search testing. Phone numbers
# are intentionally omitted to avoid fabricating personal contact details.
# --------------------------------------------------------------------------- #
STATIONS: list[dict] = [
    # ---- Lagos ----
    {
        "name": "NNPC Retail Ikeja",
        "brand": "NNPC",
        "address": "Obafemi Awolowo Way, Ikeja",
        "city": "Ikeja",
        "state": "Lagos",
        "latitude": 6.6018,
        "longitude": 3.3515,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "TotalEnergies Victoria Island",
        "brand": "TotalEnergies",
        "address": "Adeola Odeku Street, Victoria Island",
        "city": "Victoria Island",
        "state": "Lagos",
        "latitude": 6.4306,
        "longitude": 3.4217,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "Mobil Lekki Phase 1",
        "brand": "Mobil",
        "address": "Lekki-Epe Expressway, Lekki Phase 1",
        "city": "Lekki",
        "state": "Lagos",
        "latitude": 6.4474,
        "longitude": 3.4688,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Conoil Surulere",
        "brand": "Conoil",
        "address": "Adeniran Ogunsanya Street, Surulere",
        "city": "Surulere",
        "state": "Lagos",
        "latitude": 6.4922,
        "longitude": 3.3545,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Oando Yaba",
        "brand": "Oando",
        "address": "Herbert Macaulay Way, Yaba",
        "city": "Yaba",
        "state": "Lagos",
        "latitude": 6.4896,
        "longitude": 3.3733,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "MRS Oil Ikoyi",
        "brand": "MRS",
        "address": "Awolowo Road, Ikoyi",
        "city": "Ikoyi",
        "state": "Lagos",
        "latitude": 6.4476,
        "longitude": 3.4345,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "NIPCO Apapa",
        "brand": "NIPCO",
        "address": "Wharf Road, Apapa",
        "city": "Apapa",
        "state": "Lagos",
        "latitude": 6.4497,
        "longitude": 3.3625,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "Forte Oil Festac Town",
        "brand": "Forte Oil",
        "address": "1st Avenue, Festac Town",
        "city": "Festac",
        "state": "Lagos",
        "latitude": 6.4667,
        "longitude": 3.3167,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Bovas Agege",
        "brand": "Bovas",
        "address": "Agege-Ogba Road, Agege",
        "city": "Agege",
        "state": "Lagos",
        "latitude": 6.6167,
        "longitude": 3.3333,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "AA Rano Ikorodu",
        "brand": "AA Rano",
        "address": "Ikorodu-Sagamu Road, Ikorodu",
        "city": "Ikorodu",
        "state": "Lagos",
        "latitude": 6.6194,
        "longitude": 3.5106,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "NNPC Retail Alausa",
        "brand": "NNPC",
        "address": "Secretariat Road, Alausa, Ikeja",
        "city": "Alausa",
        "state": "Lagos",
        "latitude": 6.6160,
        "longitude": 3.3550,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "TotalEnergies Maryland",
        "brand": "TotalEnergies",
        "address": "Ikorodu Road, Maryland",
        "city": "Maryland",
        "state": "Lagos",
        "latitude": 6.5750,
        "longitude": 3.3680,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "Oando Ojuelegba",
        "brand": "Oando",
        "address": "Ojuelegba Roundabout, Surulere",
        "city": "Ojuelegba",
        "state": "Lagos",
        "latitude": 6.4970,
        "longitude": 3.3647,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Conoil Ojota",
        "brand": "Conoil",
        "address": "Ikorodu Road, Ojota",
        "city": "Ojota",
        "state": "Lagos",
        "latitude": 6.5556,
        "longitude": 3.3719,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Mobil Ojodu-Berger",
        "brand": "Mobil",
        "address": "Lagos-Ibadan Expressway, Ojodu-Berger",
        "city": "Berger",
        "state": "Lagos",
        "latitude": 6.6444,
        "longitude": 3.3567,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    # ---- FCT (Abuja) ----
    {
        "name": "NNPC Retail Wuse 2",
        "brand": "NNPC",
        "address": "Aminu Kano Crescent, Wuse 2, Abuja",
        "city": "Wuse 2",
        "state": "FCT",
        "latitude": 9.0820,
        "longitude": 7.4720,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
    {
        "name": "TotalEnergies Garki",
        "brand": "TotalEnergies",
        "address": "Area 1, Garki, Abuja",
        "city": "Garki",
        "state": "FCT",
        "latitude": 9.0250,
        "longitude": 7.4880,
        "fuel_types": ["PMS", "AGO", "DPK"],
    },
    {
        "name": "Oando Maitama",
        "brand": "Oando",
        "address": "Aguiyi Ironsi Street, Maitama, Abuja",
        "city": "Maitama",
        "state": "FCT",
        "latitude": 9.0900,
        "longitude": 7.4900,
        "fuel_types": ["PMS", "AGO", "DPK", "LPG"],
    },
]


def _to_geography(latitude: float, longitude: float) -> WKTElement:
    """Build a WGS-84 geography point (WKT is lon/lat ordered)."""
    return WKTElement(f"POINT({longitude} {latitude})", srid=4326)


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
            )
            session.add(station)
        else:
            station.brand = spec["brand"]
            station.address = spec["address"]
            station.state = spec["state"]
            station.location = location
            station.is_active = True

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
        description="Seed the Fuel Station Finder AI database with Nigerian "
        "fuel types and stations.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing seed rows before re-inserting (development use).",
    )
    args = parser.parse_args(argv)

    if args.reset:
        print("⚠️  Reset requested: wiping fuel types, stations and links...")

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
