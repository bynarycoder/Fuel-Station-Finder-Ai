"""Pydantic v2 validation/response schemas (re-exported for convenience)."""

from app.schemas.auth import RoleInfo, TokenClaims
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
    "FuelReportPublic",
    "FuelStationCreate",
    "FuelStationPublic",
    "FuelStationUpdate",
    "FuelStationWithDistance",
    "FuelTypeBrief",
    "NearbyStations",
    "PaginatedReports",
    "PaginatedStations",
    "ReportStationBrief",
    "ReporterBrief",
    "RoleInfo",
    "TokenClaims",
    "UserPublic",
]
