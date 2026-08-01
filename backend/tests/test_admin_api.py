"""
API-level tests for the admin dashboard (Phase 9): role gating, validation, and
the user-management happy paths (which run on SQLite since the ``users`` table
has no PostGIS dependency). Report/analytics happy-paths need PostGIS and are
covered by the query-compilation tests + RBAC assertions.
"""

from __future__ import annotations

import uuid

from app.models import User, UserRole


# --------------------------------------------------------------------------- #
# Role gating — every admin endpoint requires Admin
# --------------------------------------------------------------------------- #
async def test_analytics_requires_auth(client) -> None:
    assert (await client.get("/api/v1/admin/analytics")).status_code == 401


async def test_analytics_forbidden_for_driver(authenticated_as) -> None:
    client = authenticated_as(UserRole.DRIVER)
    assert (await client.get("/api/v1/admin/analytics")).status_code == 403


async def test_reports_list_requires_auth(client) -> None:
    assert (await client.get("/api/v1/admin/reports")).status_code == 401


async def test_users_list_forbidden_for_driver(authenticated_as) -> None:
    client = authenticated_as(UserRole.DRIVER)
    assert (await client.get("/api/v1/admin/users")).status_code == 403


async def test_report_status_update_requires_auth(client) -> None:
    response = await client.patch(
        f"/api/v1/admin/reports/{uuid.uuid4()}/status", json={"status": "verified"}
    )
    assert response.status_code == 401


async def test_report_status_update_rejects_bad_enum(authenticated_as) -> None:
    client = authenticated_as(UserRole.ADMIN)
    response = await client.patch(
        f"/api/v1/admin/reports/{uuid.uuid4()}/status", json={"status": "bogus"}
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# User management (geography-free -> executable on SQLite)
# --------------------------------------------------------------------------- #
async def test_list_users_as_admin(authenticated_as) -> None:
    client = authenticated_as(UserRole.ADMIN)
    response = await client.get("/api/v1/admin/users")
    assert response.status_code == 200
    body = response.json()
    assert "items" in body and "total" in body


async def test_update_user_role(authenticated_as, session_factory) -> None:
    client = authenticated_as(UserRole.ADMIN)
    target_id = uuid.uuid4()
    async with session_factory() as session:
        session.add(
            User(id=target_id, email="manager@naija.dev", role=UserRole.DRIVER)
        )
        await session.commit()

    response = await client.patch(
        f"/api/v1/admin/users/{target_id}", json={"role": "station_manager"}
    )
    assert response.status_code == 200
    assert response.json()["role"] == "station_manager"


async def test_disable_user(authenticated_as, session_factory) -> None:
    client = authenticated_as(UserRole.ADMIN)
    target_id = uuid.uuid4()
    async with session_factory() as session:
        session.add(User(id=target_id, email="bad@naija.dev", role=UserRole.DRIVER))
        await session.commit()

    response = await client.patch(
        f"/api/v1/admin/users/{target_id}", json={"is_active": False}
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False


async def test_update_user_rejects_empty_body(authenticated_as) -> None:
    client = authenticated_as(UserRole.ADMIN)
    response = await client.patch(
        f"/api/v1/admin/users/{uuid.uuid4()}", json={}
    )
    assert response.status_code == 400


async def test_update_unknown_user_returns_404(authenticated_as) -> None:
    client = authenticated_as(UserRole.ADMIN)
    response = await client.patch(
        f"/api/v1/admin/users/{uuid.uuid4()}", json={"is_active": False}
    )
    assert response.status_code == 404
