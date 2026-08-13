"""
API v1 router aggregation.

All v1 sub-routers are mounted here; the application includes this aggregate
under the ``/api/v1`` prefix. New feature routers (stations, reports, ...) are
added by importing and ``include_router``-ing them below.
"""

from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.favorites import router as favorites_router
from app.api.v1.reports import router as reports_router
from app.api.v1.station_import import router as station_import_router
from app.api.v1.stations import router as stations_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(stations_router)
api_router.include_router(station_import_router)
api_router.include_router(reports_router)
api_router.include_router(favorites_router)
api_router.include_router(admin_router)

__all__ = ["api_router"]
