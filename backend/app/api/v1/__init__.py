"""
API v1 router aggregation.

All v1 sub-routers are mounted here; the application includes this aggregate
under the ``/api/v1`` prefix. New feature routers (stations, reports, ...) are
added by importing and ``include_router``-ing them below.
"""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router

api_router = APIRouter()
api_router.include_router(auth_router)

__all__ = ["api_router"]
