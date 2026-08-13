"""
API tests for ``POST /api/v1/stations/import`` (Phase 3).

Covers: server-side authorization (401 anonymous, 403 non-staff), per-record
validation errors surfaced in the response, idempotent upsert through the real
HTTP path, and the provenance stored for imported records.
"""

from __future__ import annotations

from app.models import UserRole

VALID_RECORD = {
    "name": "Imported Station One",
    "brand": "TestBrand",
    "address": "1 Import Road",
    "city": "Kaduna",
    "state": "Kaduna",
    "latitude": 10.5207,
    "longitude": 7.4386,
    "fuel_type_codes": ["PMS", "AGO"],
    "source": "NMDPRA-2025",
    "source_id": "NG-0001",
}


# --------------------------------------------------------------------------- #
# Authorization (server-side, never client flags)
# --------------------------------------------------------------------------- #
async def test_import_requires_authentication(portable_client) -> None:
    response = await portable_client.post(
        "/api/v1/stations/import", json={"records": [VALID_RECORD]}
    )
    assert response.status_code == 401


async def test_import_forbidden_for_driver(
    authenticated_as, portable_client
) -> None:
    client = authenticated_as(UserRole.DRIVER)
    response = await client.post(
        "/api/v1/stations/import", json={"records": [VALID_RECORD]}
    )
    assert response.status_code == 403


async def test_import_allowed_for_admin(authenticated_as, portable_client) -> None:
    client = authenticated_as(UserRole.ADMIN)
    response = await client.post(
        "/api/v1/stations/import", json={"records": [VALID_RECORD]}
    )
    assert response.status_code == 200


async def test_import_allowed_for_station_manager(
    authenticated_as, portable_client
) -> None:
    client = authenticated_as(UserRole.STATION_MANAGER)
    response = await client.post(
        "/api/v1/stations/import", json={"records": [VALID_RECORD]}
    )
    assert response.status_code == 200


# --------------------------------------------------------------------------- #
# Validation + upsert behaviour through the API
# --------------------------------------------------------------------------- #
async def test_import_reports_per_record_validation_errors(
    authenticated_as, portable_client
) -> None:
    client = authenticated_as(UserRole.ADMIN)
    payload = {
        "records": [
            VALID_RECORD,
            {
                "name": "Bad State",
                "state": "Atlantis",
                "latitude": 10.0,
                "longitude": 7.0,
                "source": "SRC",
            },
            {
                "name": "No Source",
                "state": "Lagos",
                "latitude": 6.5,
                "longitude": 3.3,
                "fuel_type_codes": ["PMS"],
            },
        ]
    }
    response = await client.post("/api/v1/stations/import", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["imported"] == 1
    assert body["updated"] == 0
    assert [e["index"] for e in body["errors"]] == [1, 2]
    assert any("state" in " ".join(e["errors"]) for e in body["errors"])
    assert any("source" in " ".join(e["errors"]) for e in body["errors"])


async def test_import_is_idempotent_through_api(
    authenticated_as, portable_client
) -> None:
    client = authenticated_as(UserRole.ADMIN)
    first = await client.post(
        "/api/v1/stations/import", json={"records": [VALID_RECORD]}
    )
    assert first.json()["imported"] == 1

    second = await client.post(
        "/api/v1/stations/import", json={"records": [VALID_RECORD]}
    )
    body = second.json()
    assert body["imported"] == 0
    assert body["updated"] == 1
    assert body["errors"] == []


async def test_import_rejects_empty_record_list(
    authenticated_as, portable_client
) -> None:
    client = authenticated_as(UserRole.ADMIN)
    response = await client.post("/api/v1/stations/import", json={"records": []})
    assert response.status_code == 422


async def test_import_all_invalid_returns_422(
    authenticated_as, portable_client
) -> None:
    client = authenticated_as(UserRole.ADMIN)
    response = await client.post(
        "/api/v1/stations/import",
        json={
            "records": [
                {
                    "name": "Bad",
                    "state": "Atlantis",
                    "latitude": 10.0,
                    "longitude": 7.0,
                    "source": "SRC",
                }
            ]
        },
    )
    assert response.status_code == 422
    assert "errors" in response.json()["detail"]


async def test_import_stores_imported_provenance(
    authenticated_as, portable_client
) -> None:
    client = authenticated_as(UserRole.ADMIN)
    await client.post("/api/v1/stations/import", json={"records": [VALID_RECORD]})

    from sqlalchemy import select

    from app.models import FuelStation
    from app.models.fuel_station import (
        StationDataSource,
        StationVerificationStatus,
    )

    async with portable_client._portable_factory() as session:  # type: ignore[attr-defined]
        row = (
            await session.execute(
                select(
                    FuelStation.name,
                    FuelStation.data_source,
                    FuelStation.verification_status,
                    FuelStation.source_id,
                ).where(FuelStation.source_id == "NG-0001")
            )
        ).one()
    assert row.name == "Imported Station One"
    assert row.data_source == StationDataSource.IMPORTED
    assert row.verification_status == StationVerificationStatus.UNVERIFIED
    assert row.source_id == "NG-0001"
