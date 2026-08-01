"""
API-level tests for the AI endpoints (Phase 8): route gating, validation, and
the graceful 503 when an AI provider isn't configured.

The live AI calls (and the report-verify happy-path, which needs PostGIS) can't
run in this sandbox; their deterministic logic is covered by the gemini /
nl_search / base unit tests. Here we assert routing, the search 503 fallback
(no GROQ_API_KEY), and the verify endpoint's RBAC gate.
"""

from __future__ import annotations

import uuid

from app.models import UserRole


async def test_search_requires_a_query(client) -> None:
    response = await client.get("/api/v1/stations/search")
    assert response.status_code == 422


async def test_search_returns_503_when_groq_unconfigured(client) -> None:
    response = await client.get(
        "/api/v1/stations/search", params={"q": "short petrol near Ikeja"}
    )
    # GROQ_API_KEY is not set in the test environment -> service unavailable.
    assert response.status_code == 503


async def test_verify_requires_authentication(client) -> None:
    response = await client.post(f"/api/v1/reports/{uuid.uuid4()}/verify")
    assert response.status_code == 401


async def test_verify_forbidden_for_driver(authenticated_as) -> None:
    client = authenticated_as(UserRole.DRIVER)
    response = await client.post(f"/api/v1/reports/{uuid.uuid4()}/verify")
    assert response.status_code == 403
