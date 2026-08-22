"""
Geocoding API — location search for the manual location picker.

Endpoints:
- ``GET /api/v1/geocode/search?q=...`` — forward-search places by name
  (city, town, area). Used by the picker's debounced search field.
- ``GET /api/v1/geocode/reverse?latitude=..&longitude=..`` — resolve the
  place at a coordinate pair. Used when the user drags the marker on the
  picker's map so the label stays truthful.

Both proxy Nominatim through the backend service (``app/services/geocode``):
the browser never talks to a third-party geocoder directly and never holds an
API key. Provider failures are mapped to friendly messages — never raw
status codes or "POSITION_UNAVAILABLE" jargon.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.geocode import GeocodePlace, GeocodeSearchResponse
from app.services import geocode as geocode_service

router = APIRouter(prefix="/geocode", tags=["Geocoding"])

# Reusable error mapping so both handlers degrade gracefully and identically.
def _map_provider_error(exc: geocode_service.GeocodeError) -> HTTPException:
    if isinstance(exc, geocode_service.GeocodeRateLimited):
        return HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Location search is busy right now. Please try again in a moment.",
        )
    return HTTPException(
        status.HTTP_502_BAD_GATEWAY,
        "Location search is temporarily unavailable. Please try again later.",
    )


@router.get(
    "/search",
    response_model=GeocodeSearchResponse,
    summary="Search for a city, town or area by name",
)
async def search_locations(
    q: Annotated[
        str,
        Query(
            min_length=2,
            max_length=120,
            description="Place name, e.g. 'Kaduna' or 'Barnawa, Kaduna'",
        ),
    ],
) -> GeocodeSearchResponse:
    """Forward-search places by name. The user picks from the results —
    the first match is NEVER chosen automatically."""
    query = q.strip()
    try:
        results = await geocode_service.geocode_search(query)
    except geocode_service.GeocodeError as exc:
        raise _map_provider_error(exc) from exc
    return GeocodeSearchResponse(query=query, results=results)


@router.get(
    "/reverse",
    response_model=GeocodePlace,
    summary="Resolve the place at a coordinate pair",
)
async def reverse_lookup(
    latitude: Annotated[float, Query(ge=-90.0, le=90.0)],
    longitude: Annotated[float, Query(ge=-180.0, le=180.0)],
) -> GeocodePlace:
    """Return the place at ``(latitude, longitude)``, or 404 when the
    provider has no record there (e.g. drag point in open water)."""
    try:
        place = await geocode_service.reverse_geocode(latitude, longitude)
    except geocode_service.GeocodeError as exc:
        raise _map_provider_error(exc) from exc
    if place is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No location found at those coordinates.",
        )
    return GeocodePlace(**place)
