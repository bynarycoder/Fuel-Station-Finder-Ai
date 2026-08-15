"""
Pydantic schemas for the geocoding (location search) API.

The frontend location picker consumes these: it searches a city/town/area,
gets candidate places (display name + coordinates) back, and only AFTER the
user explicitly confirms one does it become the manual location. No
coordinates are ever invented server-side — every place comes from the
geocoding provider for the exact query the user typed.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class GeocodePlace(BaseModel):
    """One geocoding result — a real, provider-resolved place."""

    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    display_name: str
    name: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    type: str | None = None


class GeocodeSearchResponse(BaseModel):
    """Search results for one query string."""

    query: str
    results: list[GeocodePlace] = Field(default_factory=list)
