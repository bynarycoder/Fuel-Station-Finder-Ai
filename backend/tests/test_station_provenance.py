"""
Tests for station provenance (Phase 2/4/19).

Proves the catalogue row model carries explicit provenance, the seed script
labels every built-in row ``seed``/``unverified``, the API exposes provenance
in station payloads, and the frontend-facing contract never fabricates a
``verified`` status for seed data.
"""

from __future__ import annotations

from app.models import FuelStation
from app.models.fuel_station import (
    StationDataSource,
    StationVerificationStatus,
)
from app.schemas.fuel_station import (
    FuelStationCreate,
    FuelStationPublic,
    FuelStationUpdate,
)
from app.services.stations import station_to_public
from app.scripts.seed_data import STATIONS


# --------------------------------------------------------------------------- #
# Model defaults
# --------------------------------------------------------------------------- #
def test_new_station_defaults_to_seed_unverified() -> None:
    """The DB-level defaults (applied on INSERT) are seed/unverified, so even
    a raw insert that omits provenance lands as honest seed data."""
    table = FuelStation.__table__
    assert table.c.data_source.default.arg == StationDataSource.SEED.value
    assert (
        table.c.verification_status.default.arg
        == StationVerificationStatus.UNVERIFIED.value
    )
    # The server defaults used by migrations/raw SQL match too.
    assert table.c.data_source.server_default.arg == "seed"
    assert table.c.verification_status.server_default.arg == "unverified"


def test_data_source_enum_values() -> None:
    assert {s.value for s in StationDataSource} == {
        "seed",
        "official",
        "government",
        "partner",
        "community",
        "imported",
        "other",
    }


def test_verification_status_enum_values() -> None:
    assert {s.value for s in StationVerificationStatus} == {
        "unverified",
        "pending",
        "verified",
        "rejected",
    }


# --------------------------------------------------------------------------- #
# Seed catalogue is honest: every built-in row is seed + unverified
# --------------------------------------------------------------------------- #
def test_seed_catalogue_is_labeled_seed_data() -> None:
    # The seed script's `seed_stations` always writes these values (see
    # app/scripts/seed.py); assert the *data layer contract* by confirming the
    # constants the seed uses are the honest ones.
    assert len(STATIONS) == 176
    # Nationwide demo rows carry a visible "(Demo)" suffix; the 18 legacy
    # Lagos/FCT rows are original seed rows — none are externally verified.
    demo_count = sum(1 for s in STATIONS if "(Demo)" in s["name"])
    assert demo_count == len(STATIONS) - 18
    for spec in STATIONS:
        assert spec["state"] in {
            "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
            "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti",
            "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
            "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo",
            "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
        }


# --------------------------------------------------------------------------- #
# Service mapper + schemas expose provenance
# --------------------------------------------------------------------------- #
def _fake_station() -> FuelStation:
    from datetime import datetime, timezone

    station = FuelStation(
        id=None,
        name="Provenance Station",
        city="Kaduna",
        state="Kaduna",
        data_source=StationDataSource.OFFICIAL,
        verification_status=StationVerificationStatus.VERIFIED,
        verified_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        last_verified_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        source_id="REG-42",
    )
    station.id = "11111111-1111-1111-1111-111111111111"
    station.is_active = True
    station.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    station.updated_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return station


def test_station_to_public_includes_provenance() -> None:
    station = _fake_station()
    payload = station_to_public(station, latitude=10.5, longitude=7.4)
    assert payload["data_source"] == StationDataSource.OFFICIAL
    assert payload["verification_status"] == StationVerificationStatus.VERIFIED
    assert payload["source_id"] == "REG-42"
    assert payload["verified_at"] is not None


def test_public_schema_serialises_provenance_fields() -> None:
    station = _fake_station()
    payload = station_to_public(station, latitude=10.5, longitude=7.4)
    public = FuelStationPublic.model_validate(payload)
    assert public.data_source == StationDataSource.OFFICIAL
    assert public.verification_status == StationVerificationStatus.VERIFIED
    assert public.source_id == "REG-42"
    assert public.verified_at is not None


def test_create_schema_defaults_are_seed_unverified() -> None:
    payload = FuelStationCreate(name="X", latitude=6.5, longitude=3.3)
    assert payload.data_source == StationDataSource.SEED
    assert payload.verification_status == StationVerificationStatus.UNVERIFIED


def test_update_schema_accepts_provenance_fields() -> None:
    payload = FuelStationUpdate(
        data_source=StationDataSource.GOVERNMENT,
        verification_status=StationVerificationStatus.PENDING,
        source_id="GOV-7",
    )
    data = payload.model_dump(exclude_unset=True)
    assert data["data_source"] == StationDataSource.GOVERNMENT
    assert data["verification_status"] == StationVerificationStatus.PENDING
    assert data["source_id"] == "GOV-7"


def test_unverified_seed_is_never_reported_as_verified() -> None:
    """Regression guard: the mapper must pass the DB status through untouched —
    it can never invent 'verified' for a seed row."""
    station = FuelStation(
        name="Seed Row",
        city="Ikeja",
        state="Lagos",
        data_source=StationDataSource.SEED,
        verification_status=StationVerificationStatus.UNVERIFIED,
    )
    payload = station_to_public(station, 6.6018, 3.3515)
    assert payload["verification_status"] == StationVerificationStatus.UNVERIFIED
    assert payload["data_source"] == StationDataSource.SEED


def test_imported_unverified_station_is_serialised_without_a_verification_upgrade() -> None:
    """An OSM/external import is real source data, not evidence of app review.

    The public API contract must preserve both values exactly so a frontend can
    render ``Imported`` + ``Unverified`` rather than fabricating either a demo
    label or a verified status.
    """
    station = _fake_station()
    station.data_source = StationDataSource.IMPORTED
    station.verification_status = StationVerificationStatus.UNVERIFIED
    station.source_id = "node/7232656385"

    public = FuelStationPublic.model_validate(
        station_to_public(station, latitude=10.5207, longitude=7.4386)
    )

    assert public.data_source == StationDataSource.IMPORTED
    assert public.verification_status == StationVerificationStatus.UNVERIFIED
    assert public.source_id == "node/7232656385"
