"""Pydantic v2 validation/response schemas (re-exported for convenience)."""

from app.schemas.admin import (
    AnalyticsSummary,
    PaginatedUsers,
    ReportStatusUpdate,
    UserUpdate,
)
from app.schemas.ai import (
    NaturalLanguageSearchResult,
    ParsedQueryPublic,
    VerificationResultPublic,
)
from app.schemas.auth import RoleInfo, TokenClaims
from app.schemas.favorites import FavoriteList, FavoritePublic
from app.schemas.report import (
    FuelReportPublic,
    PaginatedReports,
    ReportStationBrief,
    ReporterBrief,
)
from app.schemas.fuel_station import (
    FuelStationCreate,
    FuelStationPublic,
    FuelStationUpdate,
    FuelStationWithDistance,
    FuelTypeBrief,
    NearbyStations,
    PaginatedStations,
)
from app.schemas.user import UserPublic

__all__ = [
    "AnalyticsSummary",
    "FavoriteList",
    "FavoritePublic",
    "NaturalLanguageSearchResult",
    "FuelReportPublic",
    "FuelStationCreate",
    "FuelStationPublic",
    "FuelStationUpdate",
    "FuelStationWithDistance",
    "FuelTypeBrief",
    "NearbyStations",
    "PaginatedReports",
    "PaginatedStations",
    "PaginatedUsers",
    "ParsedQueryPublic",
    "ReportStatusUpdate",
    "ReportStationBrief",
    "ReporterBrief",
    "RoleInfo",
    "TokenClaims",
    "UserPublic",
    "UserUpdate",
    "VerificationResultPublic",
]
