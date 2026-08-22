"""
Tests for ``GET /api/v1/reports/mine`` — the submitter's window into the
verification workflow.

Proves: auth requirement, strict per-user isolation (never another user's
reports), every status is returned (including rejected, which the public feed
hides), and the rejection reason travels back to the submitter.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import FuelReport, FuelType, FuelStation, QueueLength, ReportStatus
from app.main import app as production_app
from app.models.user import User, UserRole

STATION_ID = uuid.uuid4()


@pytest.fixture
def portable_authed(authenticated_as, portable_client):
    """Seeds a real users row and returns an authenticated client (see
    test_report_review_workflow.py for the rationale)."""

    async def _make(role: UserRole, email: str):
        user_id = uuid.uuid4()
        async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
            session.add(User(id=user_id, email=email, role=role, is_active=True))
            await session.commit()
        from app.api.deps import get_current_user
        from tests._portable_db import AuthedClient

        # Wrap instead of returning the raw client: the get_current_user
        # override is app-global, so a bare override would leak the last
        # created user into every later request. The wrapper re-asserts the
        # identity before each request.
        return AuthedClient(
            authenticated_as(role, email=email, user_id=user_id),
            User(id=user_id, email=email, role=role, is_active=True),
            production_app,
            get_current_user,
        )

    return _make


async def _seed(portable_client) -> None:
    from tests._portable_db import portable_location_wkt

    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        session.add(
            FuelStation(
                id=STATION_ID,
                name="Mine Test Station",
                brand="TestBrand",
                city="Kaduna",
                state="Kaduna",
                location=portable_location_wkt(10.5207, 7.4386),
                is_active=True,
            )
        )
        session.add(FuelType(code="PMS", name="Petrol (PMS)", is_active=True))
        await session.commit()


async def _submit(client) -> dict:
    response = await client.post(
        "/api/v1/reports",
        data={
            "station_id": str(STATION_ID),
            "fuel_type_code": "PMS",
            "price_per_litre": "650.00",
        },
    )
    assert response.status_code == 201
    return response.json()


# --------------------------------------------------------------------------- #
async def test_my_reports_requires_authentication(portable_client) -> None:
    response = await portable_client.get("/api/v1/reports/mine")
    assert response.status_code == 401


async def test_my_reports_returns_own_reports_only(
    portable_authed, portable_client
) -> None:
    await _seed(portable_client)
    driver_a = await portable_authed(UserRole.DRIVER, "a@naija.dev")
    driver_b = await portable_authed(UserRole.DRIVER, "b@naija.dev")

    report_a = await _submit(driver_a)
    report_b = await _submit(driver_b)

    mine_a = await driver_a.get("/api/v1/reports/mine")
    assert mine_a.status_code == 200
    ids_a = {r["id"] for r in mine_a.json()["items"]}
    assert report_a["id"] in ids_a
    assert report_b["id"] not in ids_a

    mine_b = await driver_b.get("/api/v1/reports/mine")
    ids_b = {r["id"] for r in mine_b.json()["items"]}
    assert report_b["id"] in ids_b
    assert report_a["id"] not in ids_b


async def test_my_reports_includes_every_status_with_reason(
    portable_authed, portable_client
) -> None:
    await _seed(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "c@naija.dev")
    admin = await portable_authed(UserRole.ADMIN, "admin-c@naija.dev")

    pending = await _submit(driver)

    await admin.patch(
        f"/api/v1/admin/reports/{pending['id']}/status",
        json={"status": "rejected", "rejection_reason": "Blurry photo."},
    )

    mine = await driver.get("/api/v1/reports/mine", params={"page_size": 50})
    assert mine.status_code == 200
    items = mine.json()["items"]

    rejected = [r for r in items if r["id"] == pending["id"]]
    assert len(rejected) == 1
    # The public feed hides rejected reports — /mine is the only public path
    # where the submitter can see the outcome.
    assert rejected[0]["status"] == "rejected"
    assert rejected[0]["rejection_reason"] == "Blurry photo."


async def test_my_reports_shows_verified_after_approval(
    portable_authed, portable_client
) -> None:
    await _seed(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "d@naija.dev")
    admin = await portable_authed(UserRole.ADMIN, "admin-d@naija.dev")
    report = await _submit(driver)

    await admin.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={"status": "verified"},
    )

    mine = await driver.get("/api/v1/reports/mine")
    match = [r for r in mine.json()["items"] if r["id"] == report["id"]]
    assert match[0]["status"] == "verified"
    assert match[0]["reviewed_at"] is not None


async def test_my_reports_pagination_is_user_scoped(
    portable_authed, portable_client
) -> None:
    await _seed(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "e@naija.dev")
    for _ in range(3):
        await _submit(driver)

    page = await driver.get("/api/v1/reports/mine", params={"page": 1, "page_size": 2})
    body = page.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2

    page2 = await driver.get("/api/v1/reports/mine", params={"page": 2, "page_size": 2})
    assert len(page2.json()["items"]) == 1
