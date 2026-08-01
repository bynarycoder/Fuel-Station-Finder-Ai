"""
Pydantic v2 schemas for the AI features (Phase 8): Gemini verification results
and Groq natural-language search.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.fuel_report import QueueLength, ReportStatus


class VerificationResultPublic(BaseModel):
    """The outcome of Gemini analysing a report photo."""

    score: float = Field(ge=0.0, le=1.0)
    is_plausible: bool
    summary: str
    detected_attributes: list[str] = Field(default_factory=list)
    report_status: ReportStatus


class ParsedQueryPublic(BaseModel):
    """The structured filters Groq extracted from a natural-language query."""

    fuel_type: str | None = None
    queue_length: QueueLength | None = None
    brand: str | None = None
    city: str | None = None
    state: str | None = None


class NaturalLanguageSearchResult(BaseModel):
    """Result of a natural-language station search."""

    query: str
    parsed: ParsedQueryPublic
    items: list[dict] = Field(default_factory=list)
    total: int = Field(ge=0)
