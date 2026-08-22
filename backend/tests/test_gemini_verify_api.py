"""
End-to-end tests for the GEMINI user journey through the real HTTP API:

    driver submits a report WITH a photo (multipart)
        -> backend stores the image and creates a PENDING report
    admin taps "Verify with AI" (POST /reports/{id}/verify)
        -> the endpoint reads the stored image
        -> Gemini analyses it
        -> the score is persisted (ai_confidence_score)
        -> a high score promotes the report to VERIFIED
        -> the verification result comes back for the UI

These are the tests that prove the endpoint ACTUALLY invokes Gemini (rather
than the service merely existing), and that a Gemini failure can never look
like a successful verification.

Gemini itself is faked; no test touches the network.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select

from app.api.v1 import reports as reports_api
from app.core.database import get_db  # noqa: F401  (documents the override chain)
from app.main import app as production_app
from app.models import FuelReport, FuelType, ReportStatus, UserRole
from app.models.fuel_station import FuelStation
from app.models.user import User
from app.services.ai.gemini import VERIFICATION_THRESHOLD, VerificationResult
from app.services.storage import ImageStorage, get_image_storage

STATION_ID = uuid.uuid4()

# A real 1x1 PNG (magic bytes matter: storage sniffs content, never the name).
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6360000002000100ffff03000006000557bfabd400"
    "00000049454e44ae426082"
)


@pytest.fixture
def temp_storage(tmp_path: Path):
    """Point report uploads at a temporary directory for the whole app."""
    storage = ImageStorage(base_dir=tmp_path, url_prefix="/media", max_bytes=5 * 1024 * 1024)
    production_app.dependency_overrides[get_image_storage] = lambda: storage
    yield storage
    production_app.dependency_overrides.pop(get_image_storage, None)


@pytest.fixture
def portable_authed(authenticated_as, portable_client):
    """Factory returning an HTTP client authenticated as a real DB user."""

    async def _make(role: UserRole, email: str):
        user_id = uuid.uuid4()
        async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
            session.add(User(id=user_id, email=email, role=role, is_active=True))
            await session.commit()
        from app.api.deps import get_current_user
        from tests._portable_db import AuthedClient

        return AuthedClient(
            authenticated_as(role, email=email, user_id=user_id),
            User(id=user_id, email=email, role=role, is_active=True),
            production_app,
            get_current_user,
        )

    return _make


async def _seed_catalogue(portable_client) -> None:
    from tests._portable_db import portable_location_wkt

    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        session.add(
            FuelStation(
                id=STATION_ID,
                name="Verification Test Station",
                brand="TestBrand",
                city="Abuja",
                state="FCT",
                location=portable_location_wkt(9.0579, 7.4951),
                is_active=True,
            )
        )
        session.add(FuelType(code="PMS", name="Petrol (PMS)", description="", is_active=True))
        await session.commit()


async def _submit_report_with_photo(client) -> dict:
    response = await client.post(
        "/api/v1/reports",
        data={
            "station_id": str(STATION_ID),
            "fuel_type_code": "PMS",
            "price_per_litre": "915.00",
        },
        files={"photo": ("queue.png", PNG_BYTES, "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _report_row(portable_client, report_id: str) -> FuelReport:
    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        result = await session.execute(
            select(FuelReport).where(FuelReport.id == uuid.UUID(report_id))
        )
        return result.scalar_one()


# --------------------------------------------------------------------------- #
# Upload leg: the photo really reaches storage and the report references it
# --------------------------------------------------------------------------- #
async def test_report_with_photo_is_stored_and_referenced(
    portable_authed, portable_client, temp_storage
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")

    report = await _submit_report_with_photo(driver)

    assert report["status"] == "pending"
    assert report["photo_url"], "the stored photo URL must come back to the client"
    stored, mime = temp_storage.read_image(report["photo_url"])
    assert stored == PNG_BYTES
    assert mime == "image/png"


async def test_report_without_photo_cannot_be_ai_verified(
    portable_authed, portable_client, temp_storage
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")
    response = await driver.post(
        "/api/v1/reports",
        data={
            "station_id": str(STATION_ID),
            "fuel_type_code": "PMS",
            "price_per_litre": "915.00",
        },
    )
    assert response.status_code == 201, response.text
    report = response.json()
    assert report["photo_url"] is None

    admin = await portable_authed(UserRole.ADMIN, "admin@naija.dev")
    verify = await admin.post(f"/api/v1/reports/{report['id']}/verify")
    assert verify.status_code == 400
    assert "no photo" in verify.json()["detail"].lower()


# --------------------------------------------------------------------------- #
# Verification leg: the endpoint really invokes Gemini and persists the result
# --------------------------------------------------------------------------- #
async def test_verify_endpoint_invokes_gemini_with_the_stored_image(
    portable_authed, portable_client, temp_storage, monkeypatch
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")
    report = await _submit_report_with_photo(driver)

    calls: list[tuple[bytes, str]] = []

    def _fake_analyze(image_bytes: bytes, mime_type: str) -> VerificationResult:
        calls.append((image_bytes, mime_type))
        return VerificationResult(
            score=0.91,
            is_plausible=True,
            summary="Vehicles queueing at a filling station.",
            detected_attributes=["fuel pumps", "vehicles queueing"],
        )

    monkeypatch.setattr(reports_api, "analyze_queue_image", _fake_analyze)

    admin = await portable_authed(UserRole.ADMIN, "admin@naija.dev")
    response = await admin.post(f"/api/v1/reports/{report['id']}/verify")

    assert response.status_code == 200, response.text
    body = response.json()

    # 1. Gemini was actually called with the bytes that were uploaded.
    assert calls, "the verify endpoint must invoke the Gemini service"
    assert calls[0][0] == PNG_BYTES
    assert calls[0][1] == "image/png"

    # 2. The response carries the schema the UI renders.
    assert body["score"] == pytest.approx(0.91)
    assert body["is_plausible"] is True
    assert body["summary"]
    assert body["detected_attributes"] == ["fuel pumps", "vehicles queueing"]
    assert body["report_status"] == ReportStatus.VERIFIED.value
    assert body["error"] is None

    # 3. The score and the promotion are persisted for the feed/admin UI.
    row = await _report_row(portable_client, report["id"])
    assert float(row.ai_confidence_score) == pytest.approx(0.91)
    assert row.status == ReportStatus.VERIFIED


async def test_low_score_persists_confidence_but_keeps_report_pending(
    portable_authed, portable_client, temp_storage, monkeypatch
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")
    report = await _submit_report_with_photo(driver)

    low = VERIFICATION_THRESHOLD - 0.3
    monkeypatch.setattr(
        reports_api,
        "analyze_queue_image",
        lambda *_: VerificationResult(
            score=low, is_plausible=False, summary="Unrelated selfie.", detected_attributes=[]
        ),
    )

    admin = await portable_authed(UserRole.ADMIN, "admin@naija.dev")
    response = await admin.post(f"/api/v1/reports/{report['id']}/verify")

    assert response.status_code == 200
    assert response.json()["report_status"] == ReportStatus.PENDING.value
    row = await _report_row(portable_client, report["id"])
    assert float(row.ai_confidence_score) == pytest.approx(low)
    assert row.status == ReportStatus.PENDING


async def test_gemini_failure_returns_503_and_never_verifies(
    portable_authed, portable_client, temp_storage, monkeypatch
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")
    report = await _submit_report_with_photo(driver)

    monkeypatch.setattr(
        reports_api,
        "analyze_queue_image",
        lambda *_: VerificationResult(
            score=0.0,
            is_plausible=False,
            summary="AI verification is currently unavailable; report held for manual review.",
            detected_attributes=[],
            error="TIMEOUT",
        ),
    )

    admin = await portable_authed(UserRole.ADMIN, "admin@naija.dev")
    response = await admin.post(f"/api/v1/reports/{report['id']}/verify")

    # The UI must learn that verification did NOT run — not a fake success.
    assert response.status_code == 503
    assert "TIMEOUT" in response.json()["detail"]

    row = await _report_row(portable_client, report["id"])
    assert row.status == ReportStatus.PENDING
    assert row.ai_confidence_score is None


async def test_submit_with_photo_auto_verifies_in_background(
    portable_authed, portable_client, temp_storage, monkeypatch
) -> None:
    """User POST /reports with a photo must invoke Gemini without an admin click."""
    await _seed_catalogue(portable_client)

    monkeypatch.setattr(
        reports_api, "AsyncSessionLocal", portable_client._portable_factory
    )

    def _fake_analyze(image_bytes: bytes, mime_type: str) -> VerificationResult:
        assert image_bytes == PNG_BYTES
        assert mime_type == "image/png"
        return VerificationResult(
            score=0.88,
            is_plausible=True,
            summary="Queue at a filling station.",
            detected_attributes=["fuel pumps"],
        )

    monkeypatch.setattr(reports_api, "analyze_queue_image", _fake_analyze)

    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")
    report = await _submit_report_with_photo(driver)

    # Response is immediate PENDING; background persists the score after.
    assert report["status"] == "pending"

    row = await _report_row(portable_client, report["id"])
    assert float(row.ai_confidence_score) == pytest.approx(0.88)
    assert row.status == ReportStatus.VERIFIED


async def test_second_auto_verify_does_not_call_gemini_again(
    portable_authed, portable_client, temp_storage, monkeypatch
) -> None:
    """After a successful auto-verify the atomic claim must skip a second Gemini call."""
    await _seed_catalogue(portable_client)
    monkeypatch.setattr(
        reports_api, "AsyncSessionLocal", portable_client._portable_factory
    )
    calls: list[int] = []

    def _fake_analyze(image_bytes: bytes, mime_type: str) -> VerificationResult:
        calls.append(1)
        return VerificationResult(
            score=0.9, is_plausible=True, summary="ok", detected_attributes=[]
        )

    monkeypatch.setattr(reports_api, "analyze_queue_image", _fake_analyze)
    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")
    report = await _submit_report_with_photo(driver)
    assert len(calls) == 1

    await reports_api.verify_submitted_report_photo(
        uuid.UUID(report["id"]), temp_storage
    )
    assert len(calls) == 1


async def test_submit_without_photo_does_not_call_gemini(
    portable_authed, portable_client, temp_storage, monkeypatch
) -> None:
    await _seed_catalogue(portable_client)
    calls: list[object] = []
    monkeypatch.setattr(
        reports_api,
        "analyze_queue_image",
        lambda *a, **k: calls.append(1) or VerificationResult(0, False, ""),
    )
    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")
    response = await driver.post(
        "/api/v1/reports",
        data={
            "station_id": str(STATION_ID),
            "fuel_type_code": "PMS",
            "price_per_litre": "915.00",
        },
    )
    assert response.status_code == 201
    assert calls == []


async def test_verify_requires_admin(
    portable_authed, portable_client, temp_storage
) -> None:
    await _seed_catalogue(portable_client)
    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")
    report = await _submit_report_with_photo(driver)

    response = await driver.post(f"/api/v1/reports/{report['id']}/verify")
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# Supabase Storage durability — verification reads the photo from object storage
# --------------------------------------------------------------------------- #
@pytest.fixture
def supabase_storage(tmp_path: Path, monkeypatch):
    """Storage backed by (mocked) Supabase Storage for the whole app."""
    storage = ImageStorage(
        base_dir=tmp_path,
        url_prefix="/media",
        max_bytes=5 * 1024 * 1024,
        supabase_url="https://abc.supabase.co",
        supabase_service_role_key="svc-key",
        supabase_bucket="report-photos",
    )
    production_app.dependency_overrides[get_image_storage] = lambda: storage
    yield storage
    production_app.dependency_overrides.pop(get_image_storage, None)


class _ApiFakeResp:
    def __init__(self, status_code: int, content: bytes = b"", headers: dict | None = None):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}


async def test_verify_endpoint_reads_supabase_photo_and_verifies(
    portable_authed, portable_client, supabase_storage, monkeypatch
) -> None:
    await _seed_catalogue(portable_client)

    get_urls: list[str] = []

    def fake_post(url, **kwargs):
        return _ApiFakeResp(200)  # bucket ensure + object upload

    def fake_get(url, **kwargs):
        get_urls.append(url)
        return _ApiFakeResp(200, content=PNG_BYTES, headers={"content-type": "image/png"})

    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setattr(httpx, "get", fake_get)

    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")
    report = await _submit_report_with_photo(driver)

    # The stored photo_url points at Supabase, not the ephemeral /media disk.
    assert report["photo_url"].startswith(
        "https://abc.supabase.co/storage/v1/object/public/report-photos/"
    )

    captured: list[tuple[bytes, str]] = []

    def fake_analyze(image_bytes: bytes, mime_type: str) -> VerificationResult:
        captured.append((image_bytes, mime_type))
        return VerificationResult(
            score=0.95,
            is_plausible=True,
            summary="Vehicles queueing at a filling station.",
            detected_attributes=["fuel pumps", "vehicles queueing"],
        )

    monkeypatch.setattr(reports_api, "analyze_queue_image", fake_analyze)

    admin = await portable_authed(UserRole.ADMIN, "admin@naija.dev")
    response = await admin.post(f"/api/v1/reports/{report['id']}/verify")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["score"] == pytest.approx(0.95)
    assert body["report_status"] == ReportStatus.VERIFIED.value

    # Verification read the photo FROM Supabase Storage.
    assert get_urls, "the verify endpoint must fetch the photo from Supabase"
    assert any("storage/v1/object/public/report-photos/" in u for u in get_urls)
    assert captured and captured[0][0] == PNG_BYTES
    assert captured[0][1] == "image/png"


async def test_verify_endpoint_storage_outage_returns_503_not_404(
    portable_authed, portable_client, supabase_storage, monkeypatch
) -> None:
    await _seed_catalogue(portable_client)

    def fake_post(url, **kwargs):
        return _ApiFakeResp(200)

    def fake_get(url, **kwargs):
        raise httpx.ConnectError("storage down")

    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setattr(httpx, "get", fake_get)

    driver = await portable_authed(UserRole.DRIVER, "driver@naija.dev")
    report = await _submit_report_with_photo(driver)

    admin = await portable_authed(UserRole.ADMIN, "admin@naija.dev")
    response = await admin.post(f"/api/v1/reports/{report['id']}/verify")

    # An outage must surface as 503 (storage unavailable) — never a misleading
    # 404 as if the image had been lost.
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"].lower()

    row = await _report_row(portable_client, report["id"])
    assert row.status == ReportStatus.PENDING
    assert row.ai_confidence_score is None
