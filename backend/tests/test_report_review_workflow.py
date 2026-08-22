"""
End-to-end tests for the complete verification state machine (Phases 6/7/12):

    PENDING → UNDER_REVIEW → VERIFIED | REJECTED

Exercised through the real HTTP API (portable SQLite schema):

* submission creates a PENDING report (with its storage reference)
* unauthorized users (drivers/anonymous) cannot approve or reject
* an authorized admin can move a report under review, approve or reject
* rejection requires a stored reason; the reason travels back to the
  submitter via ``GET /reports/mine``
* approval has a real effect: the report becomes visible to the public feed
  as verified (immutable report + derived current state)
* rejected reports stay hidden from the public feed but remain visible to
  their submitter
* re-reviewing a previously rejected report clears the rejection data
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import FuelReport, FuelType, QueueLength, ReportStatus
from app.models.fuel_station import FuelStation
from app.main import app as production_app
from app.models.user import User, UserRole

STATION_ID = uuid.uuid4()


@pytest.fixture
def portable_authed(authenticated_as, portable_client):
    """Factory that seeds a real ``users`` row in the portable DB and returns
    an HTTP client authenticated as that user (reports join ``users``).

    ``authenticated_as`` is declared first so its ``client`` dependency (the
    users-only schema fixture) runs before ``portable_client`` overrides
    ``get_db`` with the portable schema.
    """

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


async def _seed_catalogue(portable_client) -> None:
    """Insert the minimal catalogue rows a report needs (station + fuel type).

    The station uses the module-level ``STATION_ID`` so the payloads built by
    ``_report_payload`` reference a row that actually exists.
    """
    from tests._portable_db import portable_location_wkt

    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        session.add(
            FuelStation(
                id=STATION_ID,
                name="Workflow Test Station",
                brand="TestBrand",
                city="Kaduna",
                state="Kaduna",
                location=portable_location_wkt(10.5207, 7.4386),
                is_active=True,
            )
        )
        session.add(
            FuelType(code="PMS", name="Petrol (PMS)", description="", is_active=True)
        )
        await session.commit()


def _report_payload(station_id: str | None = None) -> dict:
    return {
        "station_id": station_id or str(STATION_ID),
        "fuel_type_code": "PMS",
        "price_per_litre": "650.00",
        "queue_length": "short",
        "notes": "PMS available, short queue",
    }


async def _submit_report(client) -> dict:
    response = await client.post("/api/v1/reports", data=_report_payload())
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------- #
# Submission → PENDING (with storage reference support)
# --------------------------------------------------------------------------- #
async def test_submission_creates_pending_report(
    portable_authed, portable_client
) -> None:
    await _seed_catalogue(portable_client)
    client = await portable_authed(UserRole.DRIVER, "driver@naija.dev")

    report = await _submit_report(client)

    assert report["status"] == "pending"
    assert report["station"]["name"] == "Workflow Test Station"
    assert report["price_per_litre"] == 650.0
    assert report["queue_length"] == "short"
    assert report["reported_by"]["id"] is not None
    assert report["reviewed_at"] is None
    assert report["rejection_reason"] is None

    # The row really is pending in the database.
    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        row = (
            await session.execute(
                select(FuelReport.status).where(FuelReport.id == uuid.UUID(report["id"]))
            )
        ).scalar_one()
    assert row == ReportStatus.PENDING


async def test_submission_with_photo_keeps_storage_reference(
    portable_authed, portable_client
) -> None:
    await _seed_catalogue(portable_client)
    client = await portable_authed(UserRole.DRIVER, "photographer@naija.dev")

    form = _report_payload()
    form["photo_url"] = "stored-later-by-storage-service"  # placeholder field
    form.pop("photo_url")
    # The photo upload path itself is covered by test_storage.py; here we
    # verify a persisted URL reference survives the workflow untouched.
    reporter_id = uuid.uuid4()
    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        session.add(
            User(id=reporter_id, email="photo@naija.dev", role=UserRole.DRIVER, is_active=True)
        )
        session.add(
            FuelReport(
                id=uuid.uuid4(),
                station_id=STATION_ID,
                user_id=reporter_id,
                fuel_type_code="PMS",
                price_per_litre=650,
                photo_url="/media/abc123.jpg",
                notes=None,
                status=ReportStatus.PENDING,
            )
        )
        await session.commit()

    feed = await client.get("/api/v1/reports", params={"page_size": 50})
    assert feed.status_code == 200
    items = feed.json()["items"]
    assert any(r["photo_url"] == "/media/abc123.jpg" for r in items)


# --------------------------------------------------------------------------- #
# Unauthorized approval/rejection
# --------------------------------------------------------------------------- #
async def test_driver_cannot_approve_report(
    portable_authed, portable_client
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver2@naija.dev")
    report = await _submit_report(driver)

    response = await driver.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={"status": "verified"},
    )
    assert response.status_code == 403


async def test_anonymous_cannot_approve_report(portable_client) -> None:
    response = await portable_client.patch(
        f"/api/v1/admin/reports/{uuid.uuid4()}/status",
        json={"status": "verified"},
    )
    assert response.status_code == 401


async def test_driver_cannot_reject_report(
    portable_authed, portable_client
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver3@naija.dev")
    report = await _submit_report(driver)

    response = await driver.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={"status": "rejected", "rejection_reason": "not clear"},
    )
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# Authorized review: under review → verified
# --------------------------------------------------------------------------- #
async def test_admin_moves_report_under_review(
    portable_authed, portable_client
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver4@naija.dev")
    admin = await portable_authed(UserRole.ADMIN, "admin@naija.dev")
    report = await _submit_report(driver)

    response = await admin.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={"status": "under_review"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "under_review"
    assert body["reviewed_at"] is not None
    # Reviewer identity is exposed to moderators via the admin schema…
    assert body["reviewed_by"] is not None
    assert "id" in body["reviewed_by"]
    # …but never includes private fields such as email.
    assert "email" not in body["reviewed_by"]


async def test_admin_approves_report_and_effect_is_visible(
    portable_authed, portable_client
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver5@naija.dev")
    admin = await portable_authed(UserRole.ADMIN, "admin2@naija.dev")
    report = await _submit_report(driver)

    # Public feed shows it as pending BEFORE approval.
    before = await admin.get("/api/v1/reports", params={"page_size": 50})
    assert any(
        r["id"] == report["id"] and r["status"] == "pending"
        for r in before.json()["items"]
    )

    response = await admin.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={"status": "verified", "reviewer_notes": "Photo shows pump clearly"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "verified"
    assert body["reviewed_at"] is not None
    assert body["reviewer_notes"] == "Photo shows pump clearly"

    # Approval effect: the report is now visible as VERIFIED to everyone.
    feed = await admin.get("/api/v1/reports", params={"page_size": 50})
    match = [r for r in feed.json()["items"] if r["id"] == report["id"]]
    assert len(match) == 1
    assert match[0]["status"] == "verified"

    # The report row itself carries the reviewer + decision stamps.
    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        row = (
            await session.execute(
                select(
                    FuelReport.status,
                    FuelReport.reviewed_by,
                    FuelReport.reviewed_at,
                    FuelReport.verified_at,
                ).where(FuelReport.id == uuid.UUID(report["id"]))
            )
        ).one()
    assert row.status == ReportStatus.VERIFIED
    assert row.reviewed_by is not None
    assert row.reviewed_at is not None
    assert row.verified_at is not None


# --------------------------------------------------------------------------- #
# Authorized rejection (with reason)
# --------------------------------------------------------------------------- #
async def test_rejection_requires_reason(
    portable_authed, portable_client
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver6@naija.dev")
    admin = await portable_authed(UserRole.ADMIN, "admin3@naija.dev")
    report = await _submit_report(driver)

    response = await admin.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={"status": "rejected"},
    )
    assert response.status_code == 400
    assert "rejection reason" in response.json()["detail"].lower()

    # The report is still pending — nothing was destroyed.
    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        status = (
            await session.execute(
                select(FuelReport.status).where(FuelReport.id == uuid.UUID(report["id"]))
            )
        ).scalar_one()
    assert status == ReportStatus.PENDING


async def test_admin_rejects_with_reason_and_submitter_sees_it(
    portable_authed, portable_client
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver7@naija.dev")
    admin = await portable_authed(UserRole.ADMIN, "admin4@naija.dev")
    report = await _submit_report(driver)

    response = await admin.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={
            "status": "rejected",
            "rejection_reason": "Image does not clearly show the station.",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "rejected"
    assert body["rejection_reason"] == "Image does not clearly show the station."

    # Rejected reports disappear from the public feed…
    feed = await admin.get("/api/v1/reports", params={"page_size": 50})
    assert all(r["id"] != report["id"] for r in feed.json()["items"])

    # …but the submitter sees the outcome + reason via /reports/mine.
    mine = await driver.get("/api/v1/reports/mine")
    assert mine.status_code == 200
    mine_items = mine.json()["items"]
    match = [r for r in mine_items if r["id"] == report["id"]]
    assert len(match) == 1
    assert match[0]["status"] == "rejected"
    assert match[0]["rejection_reason"] == "Image does not clearly show the station."


async def test_re_review_clears_rejection_data(
    portable_authed, portable_client
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver8@naija.dev")
    admin = await portable_authed(UserRole.ADMIN, "admin5@naija.dev")
    report = await _submit_report(driver)

    await admin.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={"status": "rejected", "rejection_reason": "Duplicate report."},
    )
    response = await admin.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={"status": "under_review"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "under_review"
    assert body["rejection_reason"] is None
    assert body["reviewed_at"] is not None


async def test_rejected_report_404_on_public_single_get(
    portable_authed, portable_client
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver9@naija.dev")
    admin = await portable_authed(UserRole.ADMIN, "admin6@naija.dev")
    report = await _submit_report(driver)
    await admin.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={"status": "rejected", "rejection_reason": "Test reason."},
    )
    response = await driver.get(f"/api/v1/reports/{report['id']}")
    assert response.status_code == 404


async def test_approval_never_rewrites_submission_fields(
    portable_authed, portable_client
) -> None:
    """Reports are immutable evidence — approving must not touch the
    submitted price/notes/photo."""
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver10@naija.dev")
    admin = await portable_authed(UserRole.ADMIN, "admin7@naija.dev")
    report = await _submit_report(driver)
    original = dict(report)

    await admin.patch(
        f"/api/v1/admin/reports/{report['id']}/status",
        json={"status": "verified"},
    )
    feed = await driver.get("/api/v1/reports", params={"page_size": 50})
    match = [r for r in feed.json()["items"] if r["id"] == report["id"]][0]
    assert match["price_per_litre"] == original["price_per_litre"]
    assert match["queue_length"] == original["queue_length"]
    assert match["notes"] == original["notes"]
    assert match["reported_by"]["id"] == original["reported_by"]["id"]
