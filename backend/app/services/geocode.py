"""
Geocoding service — a small server-side proxy to Nominatim (OpenStreetMap).

Why a backend proxy (and not a browser-side call)?
- Nominatim's usage policy requires identification (a valid User-Agent /
  Referer) and discourages heavy client-side abuse. The backend sets those
  headers, applies a timeout, limits results, and shields the frontend from
  the provider's raw errors.
- No third-party API key ever reaches the browser: there is none to leak.
- The frontend debounces searches and only ever calls OUR endpoint, so the
  request rate can be controlled centrally.

The service NEVER guesses or invents coordinates: it only returns what the
provider actually resolved, and only for the exact query string the user
typed. A failed/rate-limited provider surfaces as a typed error that the API
layer maps to a user-friendly HTTP response.

Provider contract (Nominatim JSONv2):
- ``/search?q=...`` returns a JSON list of places with ``lat`` / ``lon`` and a
  human-readable ``display_name``.
- ``/reverse?lat=..&lon=..`` returns a single place object.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


class GeocodeError(RuntimeError):
    """Base class: the geocoding provider could not answer."""


class GeocodeRateLimited(GeocodeError):
    """The provider asked us to slow down (HTTP 429)."""


class GeocodeUnavailable(GeocodeError):
    """The provider errored (non-200, network failure, timeout, ...)."""


def _headers() -> dict[str, str]:
    """Identification headers required by the Nominatim usage policy."""
    return {
        "User-Agent": settings.NOMINATIM_USER_AGENT,
        "Referer": settings.NOMINATIM_REFERER,
        "Accept": "application/json",
    }


async def _fetch_json(path: str, params: dict[str, Any]) -> Any:
    """GET ``path`` on the configured provider, returning parsed JSON.

    Raises ``GeocodeRateLimited`` on HTTP 429 and ``GeocodeUnavailable`` for
    every other failure (transport errors, timeouts, non-200 statuses).
    Tests monkeypatch this function; production callers never see raw
    provider errors.
    """
    base = settings.NOMINATIM_BASE_URL.rstrip("/")
    timeout = httpx.Timeout(settings.NOMINATIM_TIMEOUT_SECONDS)
    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            headers=_headers(),
            follow_redirects=True,
        ) as client:
            response = await client.get(f"{base}{path}", params=params)
    except httpx.HTTPError as exc:
        raise GeocodeUnavailable(
            f"Geocoding provider unreachable: {exc.__class__.__name__}"
        ) from exc

    if response.status_code == 429:
        raise GeocodeRateLimited("Geocoding provider rate limit reached")
    if response.status_code != 200:
        raise GeocodeUnavailable(
            f"Geocoding provider returned HTTP {response.status_code}"
        )
    return response.json()


def _to_place(item: dict[str, Any]) -> dict[str, Any] | None:
    """Normalise one Nominatim JSONv2 item into our public place shape.

    Returns ``None`` when the item has no usable coordinates — the provider
    sometimes emits partial records we must not forward as a "location".
    """
    try:
        latitude = float(item["lat"])
        longitude = float(item["lon"])
    except (KeyError, TypeError, ValueError):
        return None

    if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
        return None

    address = item.get("address") or {}
    name = (
        item.get("name")
        or address.get("amenity")
        or address.get("building")
        or address.get("road")
        or address.get("city")
        or address.get("town")
        or address.get("village")
    )

    return {
        "latitude": latitude,
        "longitude": longitude,
        "display_name": item.get("display_name") or "",
        "name": name or None,
        "city": (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("municipality")
        )
        or None,
        "state": address.get("state") or address.get("state_district") or None,
        "country": address.get("country") or None,
        "type": item.get("addresstype") or item.get("type") or None,
    }


async def geocode_search(query: str) -> list[dict[str, Any]]:
    """Search places matching ``query`` (city / town / area names).

    Returns an empty list when nothing matched — never invented coordinates.
    """
    data = await _fetch_json(
        "/search",
        {
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": settings.NOMINATIM_SEARCH_LIMIT,
            "accept-language": "en",
        },
    )
    if not isinstance(data, list):
        return []
    places: list[dict[str, Any]] = []
    for item in data:
        place = _to_place(item)
        if place is not None:
            places.append(place)
    return places


async def reverse_geocode(latitude: float, longitude: float) -> dict[str, Any] | None:
    """Resolve the place at ``(latitude, longitude)``, or ``None`` when the
    provider has no record there (e.g. mid-ocean).
    """
    data = await _fetch_json(
        "/reverse",
        {
            "lat": latitude,
            "lon": longitude,
            "format": "jsonv2",
            "addressdetails": 1,
            "zoom": 16,
            "accept-language": "en",
        },
    )
    if not isinstance(data, dict):
        return None
    return _to_place(data)
