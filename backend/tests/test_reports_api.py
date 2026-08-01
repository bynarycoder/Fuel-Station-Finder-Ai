"""
API-level tests for the Fuel Reports router (Phase 6/7): routing, input
validation, and authentication.

Report *reads* are public (community feed), so only ``POST`` is gated. The
create/list happy-paths need PostGIS (the report joins ``fuel_stations``) and so
are validated by the query-SQL compilation tests + the storage tests. Here we
assert the contract that does not touch the database: route wiring, 422 input
validation, and the POST 401 RBAC gate that short-circuits before data access.
"""

from __future__ import annotations

from app.models import UserRole

STATION_ID = "11111111-1111-1111-1111-111111111111"


# --------------------------------------------------------------------------- #
# POST /api/v1/reports (multipart) — authenticated
# --------------------------------------------------------------------------- #
async def test_create_requires_authentication(client) -> None:
    response = await client.post(
        "/api/v1/reports",
        data={"station_id": STATION_ID, "fuel_type_code": "PMS"},
    )
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_create_rejects_missing_required_form_field(authenticated_as) -> None:
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
# GET /api/v1/reports — public feed (validation only; happy-path needs PostGIS)
# --------------------------------------------------------------------------- #
async def test_list_rejects_invalid_pagination(client) -> None:
    response = await client.get("/api/v1/reports", params={"page": 0})
    assert response.status_code == 422


async def test_list_rejects_invalid_status_enum(client) -> None:
    response = await client.get("/api/v1/reports", params={"status": "bogus"})
    assert response.status_code == 422


async def test_get_single_rejects_non_uuid_path(client) -> None:
    response = await client.get("/api/v1/reports/not-a-uuid")
    assert response.status_code == 422
