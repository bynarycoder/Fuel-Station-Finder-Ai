"""
Pydantic schemas for the station import API (real-data ingestion).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class StationImportRequest(BaseModel):
    """Payload for ``POST /api/v1/stations/import``.

    Records are accepted as raw dicts and validated **per record** inside the
    endpoint (``parse_records``) so one malformed row never blocks the valid
    rows of the same batch.
    """

    records: list[dict[str, Any]] = Field(min_length=1, max_length=5000)


class ImportErrorDetail(BaseModel):
    """Per-record validation problems (index into the submitted list)."""

    index: int = Field(ge=0)
    errors: list[str]


class StationImportResponse(BaseModel):
    """Result summary of an import run."""

    imported: int = Field(ge=0)
    updated: int = Field(ge=0)
    skipped: int = Field(ge=0)
    errors: list[ImportErrorDetail] = Field(default_factory=list)
