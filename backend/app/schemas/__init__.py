"""Pydantic v2 validation/response schemas (re-exported for convenience)."""

from app.schemas.admin import (
    AnalyticsSummary,
    PaginatedUsers,
    ReportStatusUpdate,
    UserUpdate,
)
from app.schemas.ai import (
    AIRecommendation,
    AIRecommendRequest,
    AIRecommendResponse,
    FuelSearchIntentPublic,
    NaturalLanguageSearchResult,
    ParsedQueryPublic,
    ScoreBreakdown,
    VerificationResultPublic,
)
from app.schemas.auth import RoleInfo, TokenClaims
from app.schemas.favorites import FavoriteList, FavoritePublic
from app.schemas.report import (
    FuelReportAdmin,
    FuelReportPublic,
    PaginatedAdminReports,
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
    "AIRecommendation",
    "AIRecommendRequest",
    "AIRecommendResponse",
    "AnalyticsSummary",
    "FavoriteList",
    "FavoritePublic",
    "FuelReportAdmin",
    "FuelSearchIntentPublic",
    "NaturalLanguageSearchResult",
    "FuelReportPublic",
    "FuelStationCreate",
    "FuelStationPublic",
    "FuelStationUpdate",
    "FuelStationWithDistance",
    "FuelTypeBrief",
    "NearbyStations",
    "PaginatedAdminReports",
    "PaginatedReports",
    "PaginatedStations",
    "PaginatedUsers",
    "ParsedQueryPublic",
    "ReportStatusUpdate",
    "ReportStationBrief",
    "ReporterBrief",
    "RoleInfo",
    "ScoreBreakdown",
    "TokenClaims",
    "UserPublic",
    "UserUpdate",
    "VerificationResultPublic",
]
