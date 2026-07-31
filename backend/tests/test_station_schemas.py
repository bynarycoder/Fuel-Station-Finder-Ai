"""
Pydantic validation tests for the Fuel Stations API schemas (Phase 4).
"""

from __future__ import annotations

import datetime
import uuid

import pytest
from pydantic import ValidationError

from app.schemas import (
    FuelStationCreate,
    FuelStationPublic,
    FuelStationUpdate,
    FuelStationWithDistance,
    NearbyStations,
    PaginatedStations,
)


def _valid_create_kwargs(**overrides):
    base = {"name": "NNPC Ikeja", "latitude": 6.6018, "longitude": 3.3515}
    base.update(overrides)
    return base


# --------------------------------------------------------------------------- #
# FuelStationCreate
# --------------------------------------------------------------------------- #
def test_create_requires_coordinates() -> None:
    with pytest.raises(ValidationError):
        FuelStationCreate(name="X")


def test_create_defaults() -> None:
    payload = FuelStationCreate(**_valid_create_kwargs())
    assert payload.is_active is True
    assert payload.fuel_type_codes == []
    assert payload.brand is None


def test_create_accepts_fuel_type_codes() -> None:
    payload = FuelStationCreate(
        **_valid_create_kwargs(fuel_type_codes=["PMS", "AGO"])
    )
    assert payload.fuel_type_codes == ["PMS", "AGO"]


@pytest.mark.parametrize("bad_lat", [-90.1, 90.1, 1000])
def test_create_rejects_invalid_latitude(bad_lat) -> None:
    with pytest.raises(ValidationError):
        FuelStationCreate(**_valid_create_kwargs(latitude=bad_lat))


@pytest.mark.parametrize("bad_lon", [-180.1, 180.1, 999])
def test_create_rejects_invalid_longitude(bad_lon) -> None:
    with pytest.raises(ValidationError):
        FuelStationCreate(**_valid_create_kwargs(longitude=bad_lon))


def test_create_rejects_empty_name() -> None:
    with pytest.raises(ValidationError):
        FuelStationCreate(**_valid_create_kwargs(name=""))


# --------------------------------------------------------------------------- #
# FuelStationUpdate
# --------------------------------------------------------------------------- #
def test_update_is_fully_optional() -> None:
    payload = FuelStationUpdate()
    assert payload.model_dump(exclude_unset=True) == {}


def test_update_only_records_provided_fields() -> None:
    payload = FuelStationUpdate(name="New Name")
    assert payload.model_dump(exclude_unset=True) == {"name": "New Name"}


def test_update_rejects_invalid_latitude() -> None:
    with pytest.raises(ValidationError):
        FuelStationUpdate(latitude=91)


# --------------------------------------------------------------------------- #
# Response / collection schemas
# --------------------------------------------------------------------------- #
def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def test_public_defaults_empty_fuel_types() -> None:
    pub = FuelStationPublic(
        id=uuid.uuid4(),
        name="X",
        latitude=6.6,
        longitude=3.3,
        is_active=True,
        created_at=_now(),
        updated_at=_now(),
    )
    assert pub.fuel_types == []


def test_with_distance_rejects_negative_distance() -> None:
    with pytest.raises(ValidationError):
        FuelStationWithDistance(
            id=uuid.uuid4(),
            name="X",
            latitude=6.6,
            longitude=3.3,
            is_active=True,
            created_at=_now(),
            updated_at=_now(),
            distance_meters=-1.0,
        )


def test_paginated_requires_positive_page() -> None:
    with pytest.raises(ValidationError):
        PaginatedStations(items=[], total=0, page=0, page_size=10)


def test_paginated_requires_positive_page_size() -> None:
    with pytest.raises(ValidationError):
        PaginatedStations(items=[], total=0, page=1, page_size=0)


def test_nearby_stations_schema() -> None:
    nearby = NearbyStations(
        items=[], latitude=6.6, longitude=3.3, radius_meters=5000.0
    )
    assert nearby.items == []
    assert nearby.radius_meters == 5000.0
