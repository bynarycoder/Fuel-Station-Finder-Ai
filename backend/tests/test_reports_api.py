"""
API-level tests for the Fuel Reports router (Phase 6): routing, input
validation, and authentication.

The create/list happy-paths need PostGIS (the report joins ``fuel_stations``,
whose ``geography`` column can't exist on SQLite) and so are validated by the
query-SQL compilation tests + the storage tests. Here we assert the contract
that does not touch the database: route wiring, 422 input validation, and the
401 RBAC gate that short-circuits before any data access.
"""

from __future__ import annotations

import uuid

from app.models import UserRole

STATION_ID = "11111111-1111-1111-1111-111111111111"


# --------------------------------------------------------------------------- #
# POST /api/v1/reports (multipart)
# --------------------------------------------------------------------------- #
async def test_create_requires_authentication(client) -> None:
    response = await client.post(
        "/api/v1/reports",
        data={"station_id": STATION_ID, "fuel_type_code": "PMS"},
    )
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_create_rejects_missing_required_form_field(authenticated_as) -> None:
    # Auth passes (driver may submit), but station_id is missing -> 422.
    client = authenticated_as(UserRole.DRIVER)
    response = await client.post("/api/v1/reports", data={"fuel_type_code": "PMS"})
    assert response.status_code == 422


async def test_create_rejects_invalid_station_uuid(authenticated_as) -> None:
    client = authenticated_as(UserRole.DRIVER)
    response = await client.post(
        "/api/v1/reports",
        data={"station_id": "not-a-uuid", "fuel_type_code": "PMS"},
    )
    assert response.status_code == 422


async def test_create_rejects_invalid_queue_enum(authenticated_as) -> None:
    client = authenticated_as(UserRole.DRIVER)
    response = await client.post(
        "/api/v1/reports",
        data={
            "station_id": STATION_ID,
            "fuel_type_code": "PMS",
            "queue_length": "ridiculous",
        },
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# GET /api/v1/reports
# --------------------------------------------------------------------------- #
async def test_list_requires_authentication(client) -> None:
    response = await client.get("/api/v1/reports")
    assert response.status_code == 401


async def test_list_rejects_invalid_pagination(authenticated_as) -> None:
    client = authenticated_as(UserRole.DRIVER)
    response = await client.get("/api/v1/reports", params={"page": 0})
    assert response.status_code == 422


async def test_list_rejects_invalid_status_enum(authenticated_as) -> None:
    client = authenticated_as(UserRole.DRIVER)
    response = await client.get("/api/v1/reports", params={"status": "bogus"})
    assert response.status_code == 422


async def test_get_single_rejects_non_uuid_path(authenticated_as) -> None:
    # Auth passes, then path-param (UUID) validation fails -> 422.
    client = authenticated_as(UserRole.DRIVER)
    response = await client.get("/api/v1/reports/not-a-uuid")
    assert response.status_code == 422


async def test_get_single_requires_authentication(client) -> None:
    response = await client.get(f"/api/v1/reports/{uuid.uuid4()}")
    assert response.status_code == 401
