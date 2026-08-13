"""
Extensible station ingestion service (real-data import).

The application ships with a **seed/demo catalogue** (176 stations, clearly
labelled). This module is the sanctioned path for bringing in *genuine*
station data — from a regulator dataset, a partner feed, an official brand
directory or any other trustworthy source — without hand-editing the seed
files or the database.

Design:

* **Validate** every record before it touches the database: non-empty name,
  latitude ∈ [-90, 90], longitude ∈ [-180, 180], recognised Nigerian state,
  required ``source`` for imported records, valid fuel-type codes, valid
  optional ``source_id``.
* **Deduplicate** against the existing catalogue: a record whose ``source_id``
  matches an existing row updates that row (true idempotent upsert); otherwise
  the ``(name, city)`` business key is used, exactly like the seed script.
* **Never fabricate verification.** Imported rows are stored with the
  verification metadata the *source* provides (default: ``unverified``). The
  importer cannot mark rows ``verified`` — only an explicit review workflow
  can, and the API layer keeps that staff-only.
* **No external API is required.** ``import_stations`` accepts plain Python
  dicts, so a future provider (NMDPRA/DPR downstream data, NNPC retail
  directory, OpenStreetMap Overpass, a partner CSV/JSON export) only needs a
  small adapter that yields the same record shape. See
  ``docs/DATA_PROVENANCE.md`` for documented provider connection guidance.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models import (
    FuelStation,
    FuelTypeCode,
    StationDataSource,
    StationVerificationStatus,
)
from app.services.stations import geography_point

logger = logging.getLogger(__name__)

#: The 36 Nigerian states + FCT, as recognised by the application.
NIGERIAN_STATES: frozenset[str] = frozenset(
    {
        "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
        "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti",
        "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
        "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo",
        "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
    }
)


class StationImportRecord(BaseModel):
    """One validated station record for import.

    ``source`` is **required** free-text provenance (e.g. ``"NMDPRA-2025"``,
    ``"NNPC-Retail-Directory"``, ``"OSM-Overpass"``) — an imported record
    without provenance would otherwise be indistinguishable from seed data.
    ``source_id`` (optional, e.g. the provider's primary key) enables
    idempotent re-imports against the same source dataset. ``data_source``
    is the catalogue *category* the row is filed under (default ``imported``).
    """

    name: str = Field(min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    fuel_type_codes: list[str] = Field(default_factory=list)
    source: str = Field(min_length=1, max_length=100)
    source_id: str | None = Field(default=None, max_length=100)
    data_source: StationDataSource = StationDataSource.IMPORTED
    verification_status: StationVerificationStatus = (
        StationVerificationStatus.UNVERIFIED
    )
    verified_at: datetime | None = None

    @field_validator("state", mode="before")
    @classmethod
    def _normalise_state(cls, value: Any) -> Any:
        """Trim whitespace and normalise common FCT spellings."""
        if isinstance(value, str):
            value = value.strip()
            if value.upper() in {"FCT", "F.C.T", "ABUJA", "FEDERAL CAPITAL TERRITORY"}:
                return "FCT"
        return value

    @field_validator("fuel_type_codes")
    @classmethod
    def _normalise_fuel_codes(cls, codes: list[str]) -> list[str]:
        return [c.strip().upper() for c in codes]


def validate_record(record: StationImportRecord) -> list[str]:
    """Domain validation beyond Pydantic ranges.

    Returns a list of human-readable problems (empty = valid). The checks
    intentionally mirror the API/seed constraints so a record that passes here
    is guaranteed to be insertable.
    """
    errors: list[str] = []

    if not record.name.strip():
        errors.append("station name cannot be empty")

    if not (0 <= record.latitude <= 90) and not (-90 <= record.latitude < 0):
        errors.append("latitude must be in the range -90..90")
    if not (0 <= record.longitude <= 180) and not (-180 <= record.longitude < 0):
        errors.append("longitude must be in the range -180..180")

    if record.state is None:
        errors.append("state is required")
    elif record.state not in NIGERIAN_STATES:
        errors.append(
            f"state '{record.state}' is not a recognised Nigerian state/FCT"
        )

    if not record.source.strip():
        errors.append("source cannot be empty for imported records")

    valid_codes = FuelTypeCode.codes()
    unknown = sorted(set(record.fuel_type_codes) - valid_codes)
    if unknown:
        errors.append(f"unknown fuel type code(s): {', '.join(unknown)}")

    return errors


def parse_records(payload: list[dict[str, Any]]) -> tuple[list[StationImportRecord], list[dict[str, Any]]]:
    """Parse raw dicts into validated records.

    Returns ``(records, per_index_errors)`` where ``per_index_errors`` maps
    the original list index to a list of problem strings. Malformed records
    (schema or domain errors) never block the valid ones.
    """
    records: list[StationImportRecord] = []
    per_index_errors: list[dict[str, Any]] = []
    for index, raw in enumerate(payload):
        try:
            record = StationImportRecord.model_validate(raw)
        except ValidationError as exc:
            per_index_errors.append(
                {
                    "index": index,
                    "errors": [
                        f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}"
                        for err in exc.errors()
                    ],
                }
            )
            continue
        domain_errors = validate_record(record)
        if domain_errors:
            per_index_errors.append({"index": index, "errors": domain_errors})
            continue
        records.append(record)
    return records, per_index_errors


async def _find_existing_async(
    db: AsyncSession, record: StationImportRecord
) -> FuelStation | None:
    """Locate the row an import record should upsert into.

    Prefers ``source_id`` (strong identity), then the ``(name, city)`` natural
    business key used by the seed script.
    """
    if record.source_id:
        station = (
            await db.execute(
                select(FuelStation).where(FuelStation.source_id == record.source_id)
            )
        ).scalar_one_or_none()
        if station is not None:
            return station

    stmt = select(FuelStation).where(FuelStation.name == record.name)
    if record.city:
        stmt = stmt.where(FuelStation.city == record.city)
    return (await db.execute(stmt)).scalars().first()


def _find_existing_sync(
    session: Session, record: StationImportRecord
) -> FuelStation | None:
    """Synchronous twin of :func:`_find_existing_async` (for the CLI path)."""
    if record.source_id:
        station = session.scalars(
            select(FuelStation).where(FuelStation.source_id == record.source_id)
        ).first()
        if station is not None:
            return station
    stmt = select(FuelStation).where(FuelStation.name == record.name)
    if record.city:
        stmt = stmt.where(FuelStation.city == record.city)
    return session.scalars(stmt).first()


def _apply_record(station: FuelStation, record: StationImportRecord) -> None:
    """Copy validated record fields onto a station row (shared by async/sync)."""
    station.name = record.name
    station.brand = record.brand
    station.address = record.address
    station.city = record.city
    station.state = record.state
    station.phone = None  # imports never fabricate phone numbers
    station.location = geography_point(record.latitude, record.longitude)
    station.is_active = True
    station.data_source = record.data_source
    station.source_id = record.source_id
    station.verification_status = record.verification_status
    station.verified_at = record.verified_at
    station.last_verified_at = record.verified_at


@dataclass
class ImportSummary:
    """Result of an import run (serialisable to the API response)."""

    imported: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "imported": self.imported,
            "updated": self.updated,
            "skipped": self.skipped,
            "errors": self.errors,
        }


async def import_stations(
    db: AsyncSession, records: list[StationImportRecord]
) -> ImportSummary:
    """Idempotent upsert of validated station records (async API path)."""
    summary = ImportSummary()
    for record in records:
        existing = await _find_existing_async(db, record)
        if existing is None:
            station = FuelStation(
                name=record.name,
                brand=record.brand,
                address=record.address,
                city=record.city,
                state=record.state,
                location=geography_point(record.latitude, record.longitude),
                is_active=True,
                data_source=record.data_source,
                source_id=record.source_id,
                verification_status=record.verification_status,
                verified_at=record.verified_at,
                last_verified_at=record.verified_at,
            )
            db.add(station)
            summary.imported += 1
        else:
            if existing.data_source == StationDataSource.SEED and record.data_source != StationDataSource.SEED:
                logger.info(
                    "import: promoting seed row %r to data_source=%r",
                    existing.name,
                    record.data_source,
                )
            _apply_record(existing, record)
            summary.updated += 1
        await db.flush()
    await db.commit()
    return summary


def import_stations_sync(
    session: Session, records: list[StationImportRecord]
) -> ImportSummary:
    """Idempotent upsert of validated station records (sync CLI path)."""
    summary = ImportSummary()
    for record in records:
        existing = _find_existing_sync(session, record)
        if existing is None:
            session.add(
                FuelStation(
                    name=record.name,
                    brand=record.brand,
                    address=record.address,
                    city=record.city,
                    state=record.state,
                    location=geography_point(record.latitude, record.longitude),
                    is_active=True,
                    data_source=record.data_source,
                    source_id=record.source_id,
                    verification_status=record.verification_status,
                    verified_at=record.verified_at,
                    last_verified_at=record.verified_at,
                )
            )
            summary.imported += 1
        else:
            _apply_record(existing, record)
            summary.updated += 1
        session.flush()
    session.commit()
    return summary


__all__ = [
    "ImportSummary",
    "NIGERIAN_STATES",
    "StationImportRecord",
    "import_stations",
    "import_stations_sync",
    "parse_records",
    "validate_record",
]
