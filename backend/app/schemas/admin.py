"""
Pydantic v2 schemas for the admin dashboard (Phase 9): report moderation,
user management and analytics.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.fuel_report import ReportStatus
from app.models.user import UserRole
from app.schemas.user import UserPublic


class ReportStatusUpdate(BaseModel):
    """Payload to transition a report's status (admin moderation)."""

    status: ReportStatus


class UserUpdate(BaseModel):
    """Payload to update a user's role / active flag."""

    role: UserRole | None = None
    is_active: bool | None = None


class PaginatedUsers(BaseModel):
    items: list[UserPublic]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)


class StationCounts(BaseModel):
    total: int = Field(ge=0)
    active: int = Field(ge=0)


class ReportCounts(BaseModel):
    total: int = Field(ge=0)
    by_status: dict[str, int] = Field(default_factory=dict)


class UserCounts(BaseModel):
    total: int = Field(ge=0)
    by_role: dict[str, int] = Field(default_factory=dict)


class AnalyticsSummary(BaseModel):
    stations: StationCounts
    reports: ReportCounts
    users: UserCounts
