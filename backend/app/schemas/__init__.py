"""Pydantic v2 validation/response schemas (re-exported for convenience)."""

from app.schemas.admin import (
    AnalyticsSummary,
    PaginatedUsers,
    ReportStatusUpdate,
    UserUpdate,
)
from app.schemas.ai import (
    AIChatRequest,
    AIChatResponse,
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
from app.schemas.geocode import GeocodePlace, GeocodeSearchResponse
from app.schemas.user import UserPublic

__all__ = [
    "AIChatRequest",
    "AIChatResponse",
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
    "GeocodePlace",
    "GeocodeSearchResponse",
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
