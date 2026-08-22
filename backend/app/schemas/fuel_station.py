"""
Pydantic v2 schemas for the Fuel Stations API (Phase 4).

Clients exchange latitude/longitude as plain floats; the service layer converts
these to/from the PostGIS ``geography`` column. Responses embed the fuel types
each station offers.
"""

from __future__ import annotations

import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models.fuel_station import (
    StationDataSource,
    StationVerificationStatus,
)
from app.models.user import UserRole  # noqa: F401  (re-exported for convenience)


# --------------------------------------------------------------------------- #
# Embedded fuel-type summary
# --------------------------------------------------------------------------- #
class FuelTypeBrief(BaseModel):
    """A fuel product offered by a station (code + display name)."""

    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str


# --------------------------------------------------------------------------- #
# Public station representation (read)
# --------------------------------------------------------------------------- #
class FuelStationPublic(BaseModel):
    """The canonical station object returned to API clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    brand: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    phone: str | None = None
    latitude: float
    longitude: float
    is_active: bool
    # Provenance / verification state of the catalogue row itself.
    data_source: StationDataSource = StationDataSource.SEED
    verification_status: StationVerificationStatus = (
        StationVerificationStatus.UNVERIFIED
    )
    verified_at: datetime.datetime | None = None
    last_verified_at: datetime.datetime | None = None
    source_id: str | None = None
    fuel_types: list[FuelTypeBrief] = Field(default_factory=list)
    created_at: datetime.datetime
    updated_at: datetime.datetime


class FuelStationWithDistance(FuelStationPublic):
    """A station returned by the nearby endpoint, with distance from the origin."""

    distance_meters: float = Field(ge=0.0)


# --------------------------------------------------------------------------- #
# Write payloads
# --------------------------------------------------------------------------- #
class FuelStationCreate(BaseModel):
    """Payload to create a station. Coordinates are required."""

    name: str = Field(min_length=1, max_length=200)
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    brand: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=40)
    is_active: bool = True
    # Provenance (staff-managed; defaults to seed/unverified).
    data_source: StationDataSource = StationDataSource.SEED
    verification_status: StationVerificationStatus = (
        StationVerificationStatus.UNVERIFIED
    )
    source_id: str | None = Field(default=None, max_length=100)
    fuel_type_codes: list[str] = Field(default_factory=list)


class FuelStationUpdate(BaseModel):
    """Partial update payload. Every field is optional."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    brand: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=40)
    is_active: bool | None = None
    data_source: StationDataSource | None = None
    verification_status: StationVerificationStatus | None = None
    verified_at: datetime.datetime | None = None
    last_verified_at: datetime.datetime | None = None
    source_id: str | None = Field(default=None, max_length=100)
    fuel_type_codes: list[str] | None = None


# --------------------------------------------------------------------------- #
# Collections
# --------------------------------------------------------------------------- #
class PaginatedStations(BaseModel):
    """A page of stations plus pagination metadata."""

    items: list[FuelStationPublic]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)


class NearbyStations(BaseModel):
    """Stations within a radius of a point, nearest first."""

    items: list[FuelStationWithDistance]
    latitude: float
    longitude: float
    radius_meters: float
