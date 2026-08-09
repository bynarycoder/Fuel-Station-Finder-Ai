"""
Pydantic v2 schemas for fuel reports (Phase 6).
"""

from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.fuel_report import QueueLength, ReportStatus
from app.schemas.fuel_station import FuelTypeBrief


class ReportStationBrief(BaseModel):
    """Minimal station context embedded in a report."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    brand: str | None = None


class ReporterBrief(BaseModel):
    """The user who submitted the report (public-facing fields only)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str | None = None


class FuelReportPublic(BaseModel):
    """A fuel report, safe to return to API clients."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    station: ReportStationBrief
    reported_by: ReporterBrief
    fuel_type: FuelTypeBrief
    # Money is surfaced as a float for JSON friendliness; stored as NUMERIC(10,2).
    price_per_litre: float | None = None
    queue_length: QueueLength | None = None
    photo_url: str | None = None
    notes: str | None = None
    status: ReportStatus
    created_at: datetime.datetime
    updated_at: datetime.datetime
    # Gemini verification score (0..1); null until an AI verification ran.
    ai_confidence_score: float | None = None


class PaginatedReports(BaseModel):
    """A page of reports plus pagination metadata."""

    items: list[FuelReportPublic]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
