"""
Station data-access and business logic (Phase 4).

The query *builders* are pure functions returning SQLAlchemy ``Select`` objects,
so they can be unit-tested by compiling them against the PostgreSQL dialect
without a live database (and without mocking). The async *executors* run those
statements against the session and map results to response dictionaries.

Spatial operations lean on PostGIS via the ``geography`` column:
``ST_DWithin`` (index-backed radius filter, metres) and ``ST_Distance`` (sort
key). Latitudes/longitudes are exchanged with the API as plain floats and
converted to/from ``geography`` here.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from geoalchemy2 import Geography, Geometry, WKTElement
from sqlalchemy import asc, cast, func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FuelStation, FuelStationFuelType, FuelType

logger = logging.getLogger(__name__)

# Pagination / radius defaults and ceilings (enforced in the route layer too).
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
DEFAULT_LIMIT = 20
MAX_LIMIT = 100
DEFAULT_RADIUS_M = 5000.0
MAX_RADIUS_M = 100_000.0


@dataclass(frozen=True)
class StationFilters:
    """Filtering options shared by the list & nearby endpoints."""

    q: str | None = None
    brand: str | None = None
    city: str | None = None
    state: str | None = None
    fuel_type: str | None = None
    is_active: bool | None = True  # list defaults to active stations only


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #
def geography_point(latitude: float, longitude: float) -> WKTElement:
    """Build a WGS-84 geography point for INSERT/UPDATE (WKT is lon/lat ordered)."""
    return WKTElement(f"POINT({longitude} {latitude})", srid=4326)


def user_origin_geography(latitude: float, longitude: float) -> Any:
    """Geography point at the caller's coordinates for ST_DWithin / ST_Distance.

    PostGIS axis order is X = longitude, Y = latitude. The expression is
    built from two plain floats so the supplied location cannot be dropped,
    swapped, or replaced by a bind-processor default:

        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography(POINT, 4326)

    A bare ``cast(WKTElement, Geography)`` compiles to
    ``ST_GeogFromText(...)::geography(GEOMETRY, -1)`` (unknown SRID) and is
    not safe for the nearby search.
    """
    return cast(
        func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326),
        Geography(geometry_type="POINT", srid=4326),
    )


def _latitude_column() -> Any:
    return func.ST_Y(cast(FuelStation.location, Geometry)).label("latitude")


def _longitude_column() -> Any:
    return func.ST_X(cast(FuelStation.location, Geometry)).label("longitude")


# Eager-load each station's fuel offerings in a single round-trip.
_STATION_LINKS = selectinload(FuelStation.fuel_type_links).joinedload(
    FuelStationFuelType.fuel_type
)


def station_to_public(
    station: FuelStation, latitude: float, longitude: float
) -> dict[str, Any]:
    """Map a station ORM object + coordinates to a response dict (pure)."""
    return {
        "id": station.id,
        "name": station.name,
        "brand": station.brand,
        "address": station.address,
        "city": station.city,
        "state": station.state,
        "phone": station.phone,
        "latitude": latitude,
        "longitude": longitude,
        "is_active": station.is_active,
        "fuel_types": [
            {"code": link.fuel_type.code, "name": link.fuel_type.name}
            for link in station.fuel_type_links
        ],
        "created_at": station.created_at,
        "updated_at": station.updated_at,
    }


# --------------------------------------------------------------------------- #
# Query builders (pure — return Select objects)
# --------------------------------------------------------------------------- #
def _apply_filters(stmt: Select, filters: StationFilters) -> Select:
    """Apply the catalog filters to a statement selecting from FuelStation."""
    if filters.is_active is not None:
        stmt = stmt.where(FuelStation.is_active.is_(filters.is_active))
    if filters.q:
        stmt = stmt.where(FuelStation.name.ilike(f"%{filters.q}%"))
    if filters.brand:
        stmt = stmt.where(FuelStation.brand.ilike(f"%{filters.brand}%"))
    if filters.city:
        stmt = stmt.where(FuelStation.city.ilike(f"%{filters.city}%"))
    if filters.state:
        stmt = stmt.where(FuelStation.state.ilike(f"%{filters.state}%"))
    if filters.fuel_type:
        # Only stations that offer the requested product (EXISTS subquery).
        stmt = stmt.where(
            FuelStation.fuel_type_links.any(
                FuelStationFuelType.fuel_type_code == filters.fuel_type
            )
        )
    return stmt


def build_list_query(
    filters: StationFilters, offset: int, limit: int
) -> Select:
    """Paginated, filtered catalogue query (stations + coordinates)."""
    stmt = (
        select(FuelStation, _latitude_column(), _longitude_column())
        .options(_STATION_LINKS)
        .order_by(asc(FuelStation.name), asc(FuelStation.id))
        .offset(offset)
        .limit(limit)
    )
    return _apply_filters(stmt, filters)


def build_count_query(filters: StationFilters) -> Select:
    """Total count for the same filter set (for pagination metadata)."""
    return _apply_filters(select(func.count(FuelStation.id)), filters)


def build_get_query(station_id: Any) -> Select:
    """Fetch a single station (by id) with its coordinates and fuel types."""
    return (
        select(FuelStation, _latitude_column(), _longitude_column())
        .options(_STATION_LINKS)
        .where(FuelStation.id == station_id)
    )


def build_nearby_query(
    latitude: float,
    longitude: float,
    radius_meters: float,
    limit: int,
    fuel_type: str | None = None,
) -> Select:
    """Stations within ``radius_meters`` of the user, ordered nearest-first.

    Uses ``ST_DWithin`` (GiST-index-backed) for the radius filter and
    ``ST_Distance`` to compute and order by the distance in metres. The
    origin is ``ST_MakePoint(longitude, latitude)`` — X = lon, Y = lat —
    cast to ``geography(POINT, 4326)`` so distances are in metres on the
    spheroid. No city/state filter is applied; only the supplied point
    and radius decide membership.
    """
    origin = user_origin_geography(latitude, longitude)
    distance = func.ST_Distance(FuelStation.location, origin).label("distance_meters")
    stmt = (
        select(
            FuelStation,
            distance,
            _latitude_column(),
            _longitude_column(),
        )
        .options(_STATION_LINKS)
        .where(FuelStation.is_active.is_(True))
        .where(func.ST_DWithin(FuelStation.location, origin, radius_meters))
        .order_by(asc(distance))
        .limit(limit)
    )
    if fuel_type:
        stmt = stmt.where(
            FuelStation.fuel_type_links.any(
                FuelStationFuelType.fuel_type_code == fuel_type
            )
        )
    return stmt


# --------------------------------------------------------------------------- #
# Async executors
# --------------------------------------------------------------------------- #
async def list_stations(
    db: AsyncSession, filters: StationFilters, page: int, page_size: int
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    rows = (await db.execute(build_list_query(filters, offset, page_size))).all()
    items = [station_to_public(r[0], r.latitude, r.longitude) for r in rows]
    total = (await db.execute(build_count_query(filters))).scalar_one()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def get_station(db: AsyncSession, station_id: Any) -> dict[str, Any] | None:
    row = (await db.execute(build_get_query(station_id))).first()
    if row is None:
        return None
    return station_to_public(row[0], row.latitude, row.longitude)


async def find_nearby(
    db: AsyncSession,
    latitude: float,
    longitude: float,
    radius_meters: float,
    limit: int,
    fuel_type: str | None = None,
) -> dict[str, Any]:
    logger.info(
        "nearby received latitude=%s longitude=%s radius_meters=%s limit=%s fuel_type=%s",
        latitude,
        longitude,
        radius_meters,
        limit,
        fuel_type,
    )
    rows = (
        await db.execute(
            build_nearby_query(latitude, longitude, radius_meters, limit, fuel_type)
        )
    ).all()
    items: list[dict[str, Any]] = []
    for row in rows:
        station = station_to_public(row[0], row.latitude, row.longitude)
        station["distance_meters"] = float(row.distance_meters)
        items.append(station)
    first = items[0] if items else None
    logger.info(
        "nearby returned count=%s first_name=%s first_city=%s first_distance_m=%s",
        len(items),
        first["name"] if first else None,
        first["city"] if first else None,
        first["distance_meters"] if first else None,
    )
    return {
        "items": items,
        "latitude": latitude,
        "longitude": longitude,
        "radius_meters": radius_meters,
    }


# --------------------------------------------------------------------------- #
# Mutation executors
# --------------------------------------------------------------------------- #
async def _validate_fuel_type_codes(db: AsyncSession, codes: list[str]) -> None:
    """Ensure every requested fuel-type code exists. Raises ValueError otherwise."""
    if not codes:
        return
    existing = {
        row[0]
        for row in (
            await db.execute(select(FuelType.code).where(FuelType.code.in_(codes)))
        )
    }
    missing = sorted(set(codes) - existing)
    if missing:
        raise ValueError(f"Unknown fuel type code(s): {', '.join(missing)}")


async def create_station(
    db: AsyncSession, payload: Any
) -> dict[str, Any]:
    """Create a station and its fuel-type catalogue links."""
    await _validate_fuel_type_codes(db, payload.fuel_type_codes)
    station = FuelStation(
        name=payload.name,
        brand=payload.brand,
        address=payload.address,
        city=payload.city,
        state=payload.state,
        phone=payload.phone,
        location=geography_point(payload.latitude, payload.longitude),
        is_active=payload.is_active,
    )
    db.add(station)
    await db.flush()  # populate station.id before linking
    for code in payload.fuel_type_codes:
        station.fuel_type_links.append(FuelStationFuelType(fuel_type_code=code))
    await db.commit()
    return await get_station(db, station.id)


async def update_station(
    db: AsyncSession, station_id: Any, payload: Any
) -> dict[str, Any] | None:
    """Partially update a station. Returns None if the station does not exist."""
    station = await db.get(FuelStation, station_id)
    if station is None:
        return None

    data = payload.model_dump(exclude_unset=True)
    codes = data.pop("fuel_type_codes", None)
    new_lat = data.pop("latitude", None)
    new_lon = data.pop("longitude", None)

    for key, value in data.items():
        setattr(station, key, value)

    if new_lat is not None or new_lon is not None:
        # Merge a partial coordinate update with the existing position.
        if new_lat is None or new_lon is None:
            current = (
                await db.execute(
                    select(
                        _latitude_column(),
                        _longitude_column(),
                    ).where(FuelStation.id == station_id)
                )
            ).one()
            new_lat = new_lat if new_lat is not None else float(current[0])
            new_lon = new_lon if new_lon is not None else float(current[1])
        station.location = geography_point(new_lat, new_lon)

    if codes is not None:
        await _validate_fuel_type_codes(db, codes)
        station.fuel_type_links = [
            FuelStationFuelType(fuel_type_code=code) for code in codes
        ]

    await db.commit()
    return await get_station(db, station_id)


async def delete_station(db: AsyncSession, station_id: Any) -> bool:
    """Delete a station (cascades its fuel-type links). Returns False if absent."""
    station = await db.get(FuelStation, station_id)
    if station is None:
        return False
    await db.delete(station)
    await db.commit()
    return True
