"""
Tests for the geocoding proxy API (``/api/v1/geocode``).

The endpoint is a thin wrapper over ``app.services.geocode``, which proxies
Nominatim. Here we monkeypatch the service's ``_fetch_json`` so the tests are
deterministic and never hit the network.

Contracts under test:
- search returns provider places (display name + coordinates), never invents
  a result, and an empty provider response is an empty result list;
- the first result is never auto-selected (server just returns candidates);
- rate limits (429) surface as a friendly 429, not a raw provider error;
- provider failures surface as a friendly 502;
- reverse lookup returns the place or 404;
- the identification headers are set by the service (usage-policy guard).
"""

from __future__ import annotations

import pytest

from app.services import geocode as geocode_service
from app.services.geocode import (
    GeocodeRateLimited,
    GeocodeUnavailable,
    _headers,
)

KADUNA = {
    "place_id": 1,
    "lat": "10.5264296",
    "lon": "7.4387398",
    "display_name": "Kaduna, Kaduna State, Nigeria",
    "name": "Kaduna",
    "address": {
        "city": "Kaduna",
        "state": "Kaduna State",
        "country": "Nigeria",
    },
    "addresstype": "city",
    "type": "city",
}


def _stub_fetch(monkeypatch: pytest.MonkeyPatch, result):
    async def fake_fetch_json(path: str, params: dict) -> object:
        return result

    monkeypatch.setattr(geocode_service, "_fetch_json", fake_fetch_json)


def _stub_raise(monkeypatch: pytest.MonkeyPatch, exc: Exception):
    async def fake_fetch_json(path: str, params: dict) -> object:
        raise exc

    monkeypatch.setattr(geocode_service, "_fetch_json", fake_fetch_json)


async def test_search_returns_normalised_places(client, monkeypatch):
    _stub_fetch(monkeypatch, [KADUNA])

    response = await client.get("/api/v1/geocode/search", params={"q": "Kaduna"})

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "Kaduna"
    assert len(body["results"]) == 1
    place = body["results"][0]
    assert place["latitude"] == 10.5264296
    assert place["longitude"] == 7.4387398
    assert place["display_name"] == "Kaduna, Kaduna State, Nigeria"
    assert place["city"] == "Kaduna"
    assert place["state"] == "Kaduna State"
    assert place["country"] == "Nigeria"


async def test_search_empty_provider_response_is_empty_results(client, monkeypatch):
    _stub_fetch(monkeypatch, [])

    response = await client.get("/api/v1/geocode/search", params={"q": "Nowhere"})

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "Nowhere"
    assert body["results"] == []


async def test_search_never_invents_coordinates_for_malformed_provider_items(
    client, monkeypatch
):
    _stub_fetch(
        monkeypatch,
        [
            KADUNA,
            {"place_id": 2, "display_name": "Broken, no coordinates"},
            {"place_id": 3, "lat": "not-a-number", "lon": "3.3"},
            {"place_id": 4, "lat": "95.0", "lon": "7.0"},  # out of range
        ],
    )

    response = await client.get("/api/v1/geocode/search", params={"q": "Kaduna"})

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["display_name"] == "Kaduna, Kaduna State, Nigeria"


async def test_search_short_query_is_rejected(client):
    response = await client.get("/api/v1/geocode/search", params={"q": "a"})
    assert response.status_code == 422


async def test_search_rate_limit_maps_to_friendly_429(client, monkeypatch):
    _stub_raise(monkeypatch, GeocodeRateLimited("rate limited"))

    response = await client.get("/api/v1/geocode/search", params={"q": "Kaduna"})

    assert response.status_code == 429
    body = response.json()
    # User-friendly copy — never a raw provider status or error jargon.
    assert "busy" in body["detail"].lower()
    assert "429" not in body["detail"]


async def test_search_provider_failure_maps_to_502(client, monkeypatch):
    _stub_raise(monkeypatch, GeocodeUnavailable("provider down"))

    response = await client.get("/api/v1/geocode/search", params={"q": "Kaduna"})

    assert response.status_code == 502
    assert "temporarily unavailable" in response.json()["detail"].lower()


async def test_reverse_returns_place(client, monkeypatch):
    _stub_fetch(monkeypatch, KADUNA)

    response = await client.get(
        "/api/v1/geocode/reverse",
        params={"latitude": 10.5264296, "longitude": 7.4387398},
    )

    assert response.status_code == 200
    place = response.json()
    assert place["latitude"] == 10.5264296
    assert place["display_name"] == "Kaduna, Kaduna State, Nigeria"


async def test_reverse_unknown_point_is_404(client, monkeypatch):
    _stub_fetch(monkeypatch, {"error": "Unable to geocode"})

    response = await client.get(
        "/api/v1/geocode/reverse",
        params={"latitude": 0.0, "longitude": 0.0},
    )

    assert response.status_code == 404


async def test_reverse_invalid_coordinates_are_rejected(client):
    response = await client.get(
        "/api/v1/geocode/reverse",
        params={"latitude": 95.0, "longitude": 7.0},
    )
    assert response.status_code == 422


def test_service_sets_identification_headers(monkeypatch):
    """Nominatim usage policy: identify the application, no anonymous calls."""
    monkeypatch.setattr(geocode_service.settings, "NOMINATIM_USER_AGENT", "Agent/1.0")
    monkeypatch.setattr(geocode_service.settings, "NOMINATIM_REFERER", "https://app.example")
    headers = _headers()
    assert headers["User-Agent"] == "Agent/1.0"
    assert headers["Referer"] == "https://app.example"
    assert "Accept" in headers


async def test_service_bounds_provider_query(monkeypatch):
    """The service must forward the exact user query — never a default city."""
    captured: dict = {}

    async def fake_fetch_json(path: str, params: dict) -> object:
        captured["path"] = path
        captured["params"] = params
        return []

    monkeypatch.setattr(geocode_service, "_fetch_json", fake_fetch_json)

    await geocode_service.geocode_search("Kaduna")
    assert captured["path"] == "/search"
    assert captured["params"]["q"] == "Kaduna"
    assert captured["params"]["format"] == "jsonv2"
    assert captured["params"]["addressdetails"] == 1
