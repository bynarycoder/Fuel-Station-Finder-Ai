"""
Fuel Stations API (Phase 4) — CRUD, spatial nearby search and filtering.

Read endpoints (list, nearby, get) are **public** so drivers can find stations
without an account. Write endpoints (create, update, delete) are restricted to
privileged staff roles (Admin & Station Manager); finer, per-station scoping for
managers arrives with the admin/assignment work in a later phase.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models import UserRole
from app.schemas import (
    FuelStationCreate,
    FuelStationPublic,
    FuelStationUpdate,
    NaturalLanguageSearchResult,
    NearbyStations,
    PaginatedStations,
    ParsedQueryPublic,
)
from app.services import stations as station_service
from app.services.ai import AINotConfiguredError
from app.services.ai.nl_search import parse_natural_query

router = APIRouter(prefix="/stations", tags=["Fuel Stations"])

# Reusable role gate for write operations.
_STAFF_ONLY = require_roles(UserRole.ADMIN, UserRole.STATION_MANAGER)

# --------------------------------------------------------------------------- #
# Read (public)
# --------------------------------------------------------------------------- #
@router.get("", response_model=PaginatedStations, summary="List & filter stations")
async def list_stations(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Annotated[str | None, Query(min_length=1, max_length=100, description="Name search")] = None,
    brand: Annotated[str | None, Query(max_length=100)] = None,
    city: Annotated[str | None, Query(max_length=100)] = None,
    state: Annotated[str | None, Query(max_length=100)] = None,
    fuel_type: Annotated[str | None, Query(max_length=8, description="PMS/AGO/DPK/LPG")] = None,
    is_active: Annotated[bool | None, Query(description="Defaults to active stations")] = True,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=station_service.MAX_PAGE_SIZE)
    ] = station_service.DEFAULT_PAGE_SIZE,
) -> PaginatedStations:
    filters = station_service.StationFilters(
        q=q,
        brand=brand,
        city=city,
        state=state,
        fuel_type=fuel_type,
        is_active=is_active,
    )
    return await station_service.list_stations(db, filters, page, page_size)


@router.get(
    "/nearby",
    response_model=NearbyStations,
    summary="Find stations near a point (PostGIS distance)",
)
async def find_nearby_stations(
    db: Annotated[AsyncSession, Depends(get_db)],
    response: Response,
    latitude: Annotated[float, Query(ge=-90.0, le=90.0)],
    longitude: Annotated[float, Query(ge=-180.0, le=180.0)],
    radius_meters: Annotated[
        float,
        Query(ge=0.0, le=station_service.MAX_RADIUS_M, description="Search radius in metres"),
    ] = station_service.DEFAULT_RADIUS_M,
    limit: Annotated[int, Query(ge=1, le=station_service.MAX_LIMIT)] = station_service.DEFAULT_LIMIT,
    fuel_type: Annotated[str | None, Query(max_length=8)] = None,
) -> NearbyStations:
    # Location-specific: never let a proxy/CDN/PWA reuse another city's result.
    response.headers["Cache-Control"] = "no-store"
    return await station_service.find_nearby(
        db, latitude, longitude, radius_meters=radius_meters, limit=limit, fuel_type=fuel_type
    )


@router.get(
    "/search",
    response_model=NaturalLanguageSearchResult,
    summary="Natural-language station search (Groq)",
)
async def natural_language_search(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Annotated[
        str,
        Query(min_length=1, max_length=300, description="Free-form query, e.g. 'short petrol near Ikeja'"),
    ],
) -> NaturalLanguageSearchResult:
    """Parse a natural-language query with Groq into structured filters and
    return the matching stations plus the parsed intent."""
    try:
        parsed = parse_natural_query(q)
    except AINotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    filters = station_service.StationFilters(
        brand=parsed.brand,
        city=parsed.city,
        state=parsed.state,
        fuel_type=parsed.fuel_type,
    )
    result = await station_service.list_stations(db, filters, 1, 50)
    return NaturalLanguageSearchResult(
        query=q,
        parsed=ParsedQueryPublic(
            fuel_type=parsed.fuel_type,
            queue_length=parsed.queue_length,
            brand=parsed.brand,
            city=parsed.city,
            state=parsed.state,
        ),
        items=result["items"],
        total=result["total"],
    )


@router.get(
    "/{station_id}",
    response_model=FuelStationPublic,
    summary="Get a single station",
)
async def get_station(
    station_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FuelStationPublic:
    station = await station_service.get_station(db, station_id)
    if station is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fuel station not found")
    return station


# --------------------------------------------------------------------------- #
# Write (staff only)
# --------------------------------------------------------------------------- #
@router.post(
    "",
    response_model=FuelStationPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_STAFF_ONLY)],
    summary="Create a station",
)
async def create_station(
    payload: FuelStationCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FuelStationPublic:
    try:
        return await station_service.create_station(db, payload)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.patch(
    "/{station_id}",
    response_model=FuelStationPublic,
    dependencies=[Depends(_STAFF_ONLY)],
    summary="Update a station",
)
async def update_station(
    station_id: uuid.UUID,
    payload: FuelStationUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FuelStationPublic:
    try:
        station = await station_service.update_station(db, station_id, payload)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    if station is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fuel station not found")
    return station


@router.delete(
    "/{station_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_STAFF_ONLY)],
    summary="Delete a station",
)
async def delete_station(
    station_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    if not await station_service.delete_station(db, station_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fuel station not found")
