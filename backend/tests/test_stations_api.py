"""
API-level tests for the Fuel Stations router (Phase 4): routing, input
validation, authentication and role-based access control.

The spatial happy-paths require PostGIS (unavailable in this sandbox); they are
validated by the query-SQL compilation tests in ``test_station_queries.py`` and
documented for local PostGIS runs. Here we assert the contract that does *not*
need a database: route wiring, 422 input validation, and the 401/403 RBAC gates
that short-circuit before any data access.
"""

from __future__ import annotations

import uuid

from app.models import UserRole

STATION_ID = "11111111-1111-1111-1111-111111111111"


# --------------------------------------------------------------------------- #
# Routing + input validation (public read endpoints)
# --------------------------------------------------------------------------- #
async def test_list_rejects_invalid_pagination(client) -> None:
    response = await client.get("/api/v1/stations", params={"page": 0})
    assert response.status_code == 422


async def test_list_rejects_oversized_page(client) -> None:
    response = await client.get(
        "/api/v1/stations", params={"page_size": 99999}
    )
    assert response.status_code == 422


async def test_nearby_rejects_invalid_latitude(client) -> None:
    response = await client.get(
        "/api/v1/stations/nearby", params={"latitude": 999, "longitude": 3.3}
    )
    assert response.status_code == 422


async def test_nearby_rejects_invalid_longitude(client) -> None:
    response = await client.get(
        "/api/v1/stations/nearby", params={"latitude": 6.6, "longitude": 999}
    )
    assert response.status_code == 422


async def test_nearby_rejects_oversized_radius(client) -> None:
    response = await client.get(
        "/api/v1/stations/nearby",
        params={"latitude": 6.6, "longitude": 3.3, "radius_meters": 9_999_999},
    )
    assert response.status_code == 422


async def test_get_rejects_non_uuid_path(client) -> None:
    response = await client.get("/api/v1/stations/not-a-uuid")
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# Authentication / authorization for write endpoints
# --------------------------------------------------------------------------- #
async def test_create_requires_authentication(client) -> None:
    response = await client.post(
        "/api/v1/stations",
        json={"name": "X", "latitude": 6.6, "longitude": 3.3},
    )
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_create_forbidden_for_driver(authenticated_as) -> None:
    client = authenticated_as(UserRole.DRIVER)
    response = await client.post(
        "/api/v1/stations",
        json={"name": "X", "latitude": 6.6, "longitude": 3.3},
    )
    assert response.status_code == 403


async def test_update_forbidden_for_driver(authenticated_as) -> None:
    client = authenticated_as(UserRole.DRIVER)
    response = await client.patch(
        f"/api/v1/stations/{STATION_ID}", json={"name": "Y"}
    )
    assert response.status_code == 403


async def test_delete_requires_authentication(client) -> None:
    response = await client.delete(f"/api/v1/stations/{STATION_ID}")
    assert response.status_code == 401


async def test_delete_forbidden_for_driver(authenticated_as) -> None:
    client = authenticated_as(UserRole.DRIVER)
    response = await client.delete(f"/api/v1/stations/{STATION_ID}")
    assert response.status_code == 403


async def test_create_rejects_invalid_payload_even_for_admin(
    authenticated_as,
) -> None:
    # Admin passes the RBAC gate, but the body is invalid -> 422 (no DB).
    client = authenticated_as(UserRole.ADMIN)
    response = await client.post("/api/v1/stations", json={"name": "X"})
    assert response.status_code == 422
