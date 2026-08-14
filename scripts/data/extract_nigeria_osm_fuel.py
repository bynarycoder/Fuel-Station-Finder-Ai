#!/usr/bin/env python3
"""
Extract genuine Nigerian fuel-station data from OpenStreetMap.

This script queries the public OpenStreetMap Overpass API (no API key, no
authentication) for every object tagged ``amenity=fuel`` inside padded
bounding boxes covering the 36 Nigerian states plus the FCT, and converts the
result into the exact record shape consumed by this project's station
importer (``backend/app/services/station_import.py``):

    name, brand, address, city, state, latitude, longitude,
    fuel_type_codes, source, source_id, data_source, verification_status

Design principles (see docs/DATA_PROVENANCE.md for the full policy):

* **Nothing is invented.**  Every field comes from an OSM tag or an OSM
  geometry property.  Missing values stay ``None`` (or ``[]`` for fuels).
* **No verification is claimed.**  Records are always emitted with
  ``source="OSM-Overpass"``, ``data_source="imported"`` and
  ``verification_status="unverified"``.  OSM is a community map, not the
  NMDPRA/NNPC registry; these records must never be presented as verified.
* **Provenance is preserved.**  ``source_id`` is the OSM object identity
  (``node/<id>``, ``way/<id>``, ``relation/<id>``) so imports are idempotent.
* **Resilience.**  Requests are strictly sequential (no parallelism), spaced
  by a configurable interval, retried with backoff, and failed over across
  several public Overpass mirrors.  A failed state never stops the rest of
  the extraction; failures are recorded in the report.
* **Reproducibility.**  Every successful raw Overpass response is cached on
  disk.  ``--use-cache`` replays a cached extraction without any network
  access; this is also how the pipeline can be audited later.

OpenStreetMap data is (c) OpenStreetMap contributors and is made available
under the Open Database License (ODbL) 1.0
(https://www.openstreetmap.org/copyright).  Any application displaying this
data must provide appropriate attribution.

Examples
--------
    # Small test extraction: 25 stations from FCT only, allow overwrite.
    python scripts/data/extract_nigeria_osm_fuel.py \\
        --states FCT --limit 25 --overwrite

    # Full Nigeria extraction (36 states + FCT).
    python scripts/data/extract_nigeria_osm_fuel.py --overwrite

    # Replay a previous extraction entirely from the local response cache.
    python scripts/data/extract_nigeria_osm_fuel.py --use-cache --overwrite

Outputs (created automatically, never overwritten unless --overwrite):
    scripts/data/output/nigeria_osm_fuel_stations.json
    scripts/data/output/nigeria_osm_fuel_stations.csv
    scripts/data/output/nigeria_osm_fuel_report.json
    scripts/data/output/cache/<state_slug>.json   (raw Overpass responses)
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import math
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

__version__ = "1.0.0"

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

SOURCE_NAME = "OSM-Overpass"
DATA_SOURCE = "imported"
VERIFICATION_STATUS = "unverified"

#: Canonical product codes recognised by the application (see
#: backend/app/models/fuel_type.py — must never contain anything else).
VALID_FUEL_CODES: tuple[str, ...] = ("PMS", "AGO", "DPK", "LPG", "CNG")

OSM_ATTRIBUTION = (
    "Data (c) OpenStreetMap contributors, made available under the Open "
    "Database License (ODbL) 1.0 — https://www.openstreetmap.org/copyright"
)

USER_AGENT = (
    f"FuelStationFinderAI-OSM-extractor/{__version__} "
    "(+https://github.com/bynarycoder/Fuel-Station-Finder-Ai; "
    "single-threaded batch extraction of amenity=fuel in Nigeria)"
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "scripts" / "data" / "output"
DEFAULT_CACHE_DIR = DEFAULT_OUTPUT_DIR / "cache"
BACKEND_DIR = REPO_ROOT / "backend"

OUTPUT_JSON_NAME = "nigeria_osm_fuel_stations.json"
OUTPUT_CSV_NAME = "nigeria_osm_fuel_stations.csv"
OUTPUT_REPORT_NAME = "nigeria_osm_fuel_report.json"

#: The 36 Nigerian states + FCT, exactly matching the application's
#: ``NIGERIAN_STATES`` (backend/app/services/station_import.py).  Order is
#: the canonical processing order and keeps output deterministic.
NIGERIAN_STATES: tuple[str, ...] = (
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
    "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti",
    "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
    "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo",
    "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
)

#: OSM ISO3166-2 codes for the 36 states + FCT, taken from the OSM
#: ``admin_level=4`` boundary relations (verified against Overpass on
#: 2026-08-14).  The extractor queries each state by its exact
#: administrative area so stations outside Nigeria (or in a different
#: state) can never leak into a query.
STATE_ISO3166_2: dict[str, str] = {
    "Abia": "NG-AB",
    "Adamawa": "NG-AD",
    "Akwa Ibom": "NG-AK",
    "Anambra": "NG-AN",
    "Bauchi": "NG-BA",
    "Bayelsa": "NG-BY",
    "Benue": "NG-BE",
    "Borno": "NG-BO",
    "Cross River": "NG-CR",
    "Delta": "NG-DE",
    "Ebonyi": "NG-EB",
    "Edo": "NG-ED",
    "Ekiti": "NG-EK",
    "Enugu": "NG-EN",
    "FCT": "NG-FC",
    "Gombe": "NG-GO",
    "Imo": "NG-IM",
    "Jigawa": "NG-JI",
    "Kaduna": "NG-KD",
    "Kano": "NG-KN",
    "Katsina": "NG-KT",
    "Kebbi": "NG-KE",
    "Kogi": "NG-KO",
    "Kwara": "NG-KW",
    "Lagos": "NG-LA",
    "Nasarawa": "NG-NA",
    "Niger": "NG-NI",
    "Ogun": "NG-OG",
    "Ondo": "NG-ON",
    "Osun": "NG-OS",
    "Oyo": "NG-OY",
    "Plateau": "NG-PL",
    "Rivers": "NG-RI",
    "Sokoto": "NG-SO",
    "Taraba": "NG-TA",
    "Yobe": "NG-YO",
    "Zamfara": "NG-ZA",
}

#: Padded bounding boxes (south, west, north, east) used as a **fallback**
#: when a state's Overpass ``area`` cannot be resolved (some mirrors keep a
#: stale area database).  They deliberately overlap at domestic borders (a
#: station near a boundary can legitimately appear in two queries;
#: ``source_id`` dedup keeps the first occurrence) and are trimmed at the
#: international borders to avoid neighbouring countries.  Coordinates are
#: query geometry only — they are never written into records.
STATE_BBOXES: dict[str, tuple[float, float, float, float]] = {
    "Abia": (4.85, 6.95, 6.10, 7.90),
    "Adamawa": (7.55, 10.95, 11.05, 13.35),
    "Akwa Ibom": (4.40, 7.35, 5.65, 8.30),
    "Anambra": (5.60, 6.55, 6.85, 7.35),
    "Bauchi": (9.30, 9.20, 12.05, 10.85),
    "Bayelsa": (4.05, 5.25, 5.45, 6.85),
    "Benue": (6.35, 7.65, 8.35, 10.00),
    "Borno": (9.95, 11.45, 13.85, 14.45),
    "Cross River": (4.55, 7.65, 7.05, 9.45),
    "Delta": (4.85, 4.95, 6.55, 6.85),
    "Ebonyi": (5.55, 7.25, 6.65, 8.55),
    "Edo": (5.65, 4.95, 7.55, 6.85),
    "Ekiti": (7.15, 4.75, 8.15, 5.95),
    "Enugu": (5.75, 6.85, 7.15, 7.95),
    "FCT": (8.25, 6.60, 9.62, 7.85),
    "Gombe": (9.55, 10.85, 11.05, 11.95),
    "Imo": (5.15, 6.65, 5.95, 7.45),
    "Jigawa": (10.95, 7.95, 12.85, 10.65),
    "Kaduna": (8.95, 6.95, 11.75, 9.05),
    "Kano": (10.45, 7.55, 12.65, 9.75),
    "Katsina": (11.05, 6.75, 13.45, 9.15),
    "Kebbi": (10.05, 3.55, 13.05, 6.25),
    "Kogi": (6.45, 5.45, 8.75, 8.05),
    "Kwara": (7.55, 2.65, 10.25, 6.45),
    "Lagos": (6.35, 2.65, 6.80, 4.45),
    "Nasarawa": (7.65, 6.95, 9.35, 9.95),
    "Niger": (8.15, 3.30, 11.45, 7.45),
    "Ogun": (6.25, 2.55, 8.05, 4.35),
    "Ondo": (5.75, 4.25, 7.95, 6.05),
    "Osun": (6.95, 3.85, 8.15, 5.05),
    "Oyo": (6.85, 2.55, 9.15, 4.65),
    "Plateau": (8.15, 8.35, 10.25, 10.35),
    "Rivers": (4.25, 6.35, 5.45, 7.65),
    "Sokoto": (10.95, 4.15, 13.85, 6.85),
    "Taraba": (6.35, 9.55, 9.65, 12.00),
    "Yobe": (10.45, 9.55, 13.25, 13.05),
    "Zamfara": (11.05, 5.35, 13.25, 7.55),
}

#: Public Overpass API mirrors, tried in order.  All are volunteer-run public
#: endpoints; the extraction is strictly sequential and rate-limited so it
#: stays polite to every one of them.
DEFAULT_ENDPOINTS: tuple[tuple[str, str], ...] = (
    ("overpass-api.de", "https://overpass-api.de/api/interpreter"),
    ("overpass.kumi.systems", "https://overpass.kumi.systems/api/interpreter"),
    ("overpass.private.coffee", "https://overpass.private.coffee/api/interpreter"),
    ("overpass.osm.ch", "https://overpass.osm.ch/api/interpreter"),
    ("maps.mail.ru", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"),
    ("overpass.nchc.org.tw", "https://overpass.nchc.org.tw/api/interpreter"),
    ("openstreetmap.fr", "https://overpass-api.openstreetmap.fr/api/interpreter"),
)

#: OSM tag key (lower-case) -> canonical application fuel code.  Keys are
#: matched case-insensitively so real-world variants such as ``fuel:Petrol``
#: or the common ``fuel:kerosine`` misspelling are not lost.  Anything not
#: listed here is deliberately ignored — fuel types are never guessed.
FUEL_TAG_TO_CODE: dict[str, str] = {
    # Petrol / Premium Motor Spirit (PMS)
    "fuel:petrol": "PMS",
    "fuel:petrole": "PMS",  # common misspelling seen in Nigerian OSM data
    "fuel:petroleum": "PMS",
    "fuel:gasoline": "PMS",
    "fuel:pms": "PMS",
    "fuel:octane_91": "PMS",
    "fuel:octane_92": "PMS",
    "fuel:octane_93": "PMS",
    "fuel:octane_94": "PMS",
    "fuel:octane_95": "PMS",
    "fuel:octane_97": "PMS",
    "fuel:octane_98": "PMS",
    "fuel:octane_100": "PMS",
    "fuel:e10": "PMS",
    "petrol": "PMS",
    "gasoline": "PMS",
    "pms": "PMS",
    # Diesel / Automotive Gas Oil (AGO)
    "fuel:diesel": "AGO",
    "fuel:ago": "AGO",
    "fuel:gasoil": "AGO",
    "fuel:hgv_diesel": "AGO",
    "fuel:biodiesel": "AGO",
    "fuel:gtl_diesel": "AGO",
    "diesel": "AGO",
    "ago": "AGO",
    "gasoil": "AGO",
    # Kerosene / Dual Purpose Kerosene (DPK)
    "fuel:kerosene": "DPK",
    "fuel:kerosine": "DPK",
    "fuel:dpk": "DPK",
    "fuel:paraffin": "DPK",
    "kerosene": "DPK",
    "kerosine": "DPK",
    "dpk": "DPK",
    "paraffin": "DPK",
    # Liquefied Petroleum Gas (LPG)
    "fuel:lpg": "LPG",
    "fuel:gas": "LPG",  # OSM wiki: fuel:gas = autogas (LPG)
    "fuel:cooking_gas": "LPG",
    "lpg": "LPG",
    # Compressed Natural Gas (CNG)
    "fuel:cng": "CNG",
    "fuel:natural_gas": "CNG",
    "fuel:methane": "CNG",  # methane = natural gas (vehicular CNG)
    "fuel:methane_gas": "CNG",
    "cng": "CNG",
}

#: Tags whose value contributes to a record's ``state``, tried in order.
STATE_TAG_KEYS: tuple[str, ...] = ("addr:state", "addr:province", "is_in:state", "is_in")

#: Tags considered for the ``city`` field, in priority order.
CITY_TAG_KEYS: tuple[str, ...] = ("addr:city", "addr:town", "addr:suburb")

#: Extra state-name spellings seen in Nigerian OSM data.
STATE_ALIASES: dict[str, str] = {
    "nassarawa": "Nasarawa",
    "akwaibomstate": "Akwa Ibom",
    "federalcapitalterritory": "FCT",
    "fedcapitalterritory": "FCT",
}


def _state_key(value: str) -> str:
    """Lower-case, strip everything that isn't a letter (spaces, dashes...)."""
    return re.sub(r"[^a-z]", "", value.lower())


#: Normalised-key -> canonical-name lookup (states + known aliases).
_STATE_LOOKUP: dict[str, str] = {
    _state_key(state): state for state in NIGERIAN_STATES
}
_STATE_LOOKUP.update({_state_key(alias): canonical for alias, canonical in STATE_ALIASES.items()})


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #

_JSON_TRUE = frozenset({"yes", "true", "1"})


def _tag_is_truthy(value: Any) -> bool:
    """Treat a tag value as "yes" only for the standard truthy spellings.

    Anything else (including the standard negative spellings and unusual
    values) is treated as *not offered* — conservative on purpose, so a
    fuel type is never asserted without OSM saying yes.
    """
    if not isinstance(value, str):
        return False
    v = value.strip().lower()
    return v in _JSON_TRUE


def _clean_tag(value: Any, max_len: int | None = None) -> str | None:
    """Return a trimmed, non-empty string tag value (or ``None``)."""
    if not isinstance(value, str):
        return None
    v = " ".join(value.split())
    if not v:
        return None
    if max_len is not None and len(v) > max_len:
        v = v[:max_len].rstrip()
    return v or None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def state_slug(state: str) -> str:
    """Readable file-name slug for a state (e.g. "Cross River" -> cross_river)."""
    slug = re.sub(r"[^a-z]+", "_", state.lower()).strip("_")
    return slug or "unknown"


def haversine_metres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres (WGS-84, spherical approximation)."""
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _norm_name(name: str) -> str:
    """Normalise a station name for duplicate detection (never for output)."""
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


# --------------------------------------------------------------------------- #
# Overpass query building
# --------------------------------------------------------------------------- #

def build_area_query(state: str, timeout: int = 60) -> str:
    """Per-state ``amenity=fuel`` query using the state's exact OSM
    administrative area (ISO3166-2 code), so only elements physically
    inside the state are returned."""
    code = STATE_ISO3166_2[state]
    return (
        f"[out:json][timeout:{timeout}];"
        f"area[\"ISO3166-2\"=\"{code}\"]->.a;"
        f"(node[\"amenity\"=\"fuel\"](area.a);"
        f"way[\"amenity\"=\"fuel\"](area.a);"
        f"relation[\"amenity\"=\"fuel\"](area.a););"
        f"out center tags;"
    )


def build_bbox_query(state: str, timeout: int = 60) -> str:
    """Fallback per-state query over the padded bounding box (used only
    when a mirror cannot resolve the state's ``area``)."""
    south, west, north, east = STATE_BBOXES[state]
    bbox = f"{south},{west},{north},{east}"
    return (
        f"[out:json][timeout:{timeout}];"
        f"(node[\"amenity\"=\"fuel\"]({bbox});"
        f"way[\"amenity\"=\"fuel\"]({bbox});"
        f"relation[\"amenity\"=\"fuel\"]({bbox}););"
        f"out center tags;"
    )


def build_overpass_query(state: str, timeout: int = 60) -> str:
    """Build the primary per-state query (exact administrative area).

    ``out center tags`` returns, for ways/relations, the computed
    representative ``center`` coordinate plus all tags — exactly what the
    extractor needs without pulling full geometries.
    """
    return build_area_query(state, timeout=timeout)


# --------------------------------------------------------------------------- #
# HTTP layer (stdlib only, sequential and rate-limited)
# --------------------------------------------------------------------------- #

class HttpFailure(Exception):
    """An HTTP error that should be treated as a failed attempt."""

    def __init__(self, status: int, body: str, retry_after: str | None = None):
        super().__init__(f"HTTP {status}: {body[:300]}")
        self.status = status
        self.body = body
        self.retry_after = retry_after


class NetworkFailure(Exception):
    """A transport-level failure (DNS, TLS, timeout, connection reset)."""


class OverpassResponseError(Exception):
    """The endpoint answered 200 but the payload was not usable."""


def _request_once(
    endpoint: str, method: str, query: str, timeout: int
) -> tuple[int, str, str | None]:
    """One HTTP request; raises HttpFailure/NetworkFailure on failure."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    url = endpoint
    data: bytes | None = None
    if method == "POST":
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"
        data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    else:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}data={urllib.parse.quote(query, safe='')}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return (
                int(response.status),
                response.read().decode("utf-8", "replace"),
                response.headers.get("Retry-After"),
            )
    except urllib.error.HTTPError as exc:
        retry_after = exc.headers.get("Retry-After") if exc.headers else None
        raise HttpFailure(int(exc.code), exc.read().decode("utf-8", "replace"), retry_after) from exc
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
        raise NetworkFailure(f"{type(exc).__name__}: {exc}") from exc


def request_overpass(endpoint: str, query: str, timeout: int) -> tuple[int, str, str | None]:
    """Submit one Overpass query (POST first, GET fallback).

    GET is only retried for errors that can plausibly be POST-specific
    (400/405/413/414 or a transport error), so mirrors that only accept GET
    still work.
    """
    last_transport_error: Exception | None = None
    for method in ("POST", "GET"):
        try:
            return _request_once(endpoint, method, query, timeout)
        except HttpFailure as exc:
            if exc.status in (400, 405, 413, 414) and method == "POST":
                last_transport_error = exc
                continue
            raise
        except NetworkFailure as exc:
            if method == "POST":
                last_transport_error = exc
                continue
            raise
    assert last_transport_error is not None  # both methods tried
    raise last_transport_error


# --------------------------------------------------------------------------- #
# Cache (raw Overpass responses, for replay / audit)
# --------------------------------------------------------------------------- #

CACHE_FORMAT = "overpass-response-cache-v1"


def _cache_path(cache_dir: Path, state: str) -> Path:
    return cache_dir / f"{state_slug(state)}.json"


def _read_cache(cache_dir: Path, state: str) -> dict[str, Any] | None:
    """Load a cached raw Overpass response envelope, or ``None``."""
    path = _cache_path(cache_dir, state)
    if not path.is_file():
        return None
    try:
        envelope = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logging.warning("cache file %s is unreadable (%s); treating as a miss", path, exc)
        return None
    if not isinstance(envelope, dict) or envelope.get("format") != CACHE_FORMAT:
        logging.warning("cache file %s has an unexpected format; treating as a miss", path)
        return None
    if envelope.get("state") != state:
        logging.warning("cache file %s belongs to %r, not %r; treating as a miss",
                        path, envelope.get("state"), state)
        return None
    return envelope


def _write_cache(
    cache_dir: Path,
    state: str,
    endpoint: str,
    query: str,
    status: int,
    body_text: str,
) -> Path:
    envelope = {
        "format": CACHE_FORMAT,
        "state": state,
        "endpoint": endpoint,
        "query": query,
        "fetched_at": utc_now_iso(),
        "http_status": status,
        "body": body_text,
    }
    # Validate the body before persisting it so the cache can never hold
    # a response the pipeline itself would reject.
    json.loads(body_text)
    path = _cache_path(cache_dir, state)
    path.write_text(json.dumps(envelope, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


# --------------------------------------------------------------------------- #
# Tag -> record extraction
# --------------------------------------------------------------------------- #

def normalise_state(value: Any) -> str | None:
    """Normalise an OSM state-ish tag to a canonical state name (or ``None``).

    Unknown spellings return ``None`` — the caller then falls back to the
    state whose query bounding box contained the element.  Nothing is ever
    mapped to a state it does not actually name.
    """
    if not isinstance(value, str):
        return None
    v = value.strip()
    if not v:
        return None
    if v.upper() in {"FCT", "F.C.T", "ABUJA", "FEDERAL CAPITAL TERRITORY"}:
        return "FCT"
    # "Lagos State" / "Ondo State" / ... -> strip the word "state".
    v = re.sub(r"\bstate\b", " ", v, flags=re.IGNORECASE)
    return _STATE_LOOKUP.get(_state_key(v))


def resolve_state(tags: dict[str, str], fallback_state: str) -> str:
    """Pick the record's state from OSM tags, else the query state.

    ``is_in`` is a free-text field ("Kano State, Nigeria"), so it is split
    on commas/semicolons and each part is normalised; the first recognised
    part wins.  If OSM says nothing recognisable, the state the element was
    queried inside is used — a geographic fact, not a guess.
    """
    for key in STATE_TAG_KEYS:
        raw = tags.get(key)
        if not isinstance(raw, str) or not raw.strip():
            continue
        for part in re.split(r"[,;/|]", raw):
            normalised = normalise_state(part)
            if normalised is not None:
                return normalised
    return fallback_state


def resolve_city(tags: dict[str, str]) -> str | None:
    for key in CITY_TAG_KEYS:
        city = _clean_tag(tags.get(key), max_len=100)
        if city:
            return city
    return None


def build_address(tags: dict[str, str]) -> str | None:
    """Build an address *only* from actual OSM address tags.

    Preference order:
    1. ``addr:full`` (verbatim, mappers' own address string);
    2. ``addr:housenumber`` + ``addr:street``;
    3. ``addr:housename`` alone (common in Nigerian OSM data).
    Anything else is considered "no address information" -> ``None``.
    """
    addr_full = _clean_tag(tags.get("addr:full"))
    if addr_full:
        return addr_full[:255]
    house = _clean_tag(tags.get("addr:housenumber"))
    street = _clean_tag(tags.get("addr:street"))
    if house or street:
        return ", ".join(part for part in (house, street) if part)[:255]
    housename = _clean_tag(tags.get("addr:housename"))
    if housename:
        return housename[:255]
    return None


def map_fuel_codes(tags: dict[str, str]) -> list[str]:
    """Map OSM fuel tags to canonical codes (PMS/AGO/DPK/LPG/CNG only).

    Unknown fuel tags are ignored; a tag value that is not clearly "yes" is
    treated as "not offered".  The result is ordered canonically.
    """
    codes: set[str] = set()
    for key, value in tags.items():
        if not isinstance(key, str):
            continue
        code = FUEL_TAG_TO_CODE.get(key.lower().strip())
        if code is not None and _tag_is_truthy(value):
            codes.add(code)
    return [code for code in VALID_FUEL_CODES if code in codes]


def extract_record(element: dict[str, Any], query_state: str) -> dict[str, Any]:
    """Convert one Overpass element into an importer-shaped record dict.

    May raise ``ValueError`` if the element has no usable coordinates
    (ways/relations whose ``center`` is absent).  ``state`` always resolves
    to a canonical state name (OSM tag first, query state otherwise).
    """
    tags = element.get("tags") or {}
    osm_type = str(element.get("type") or "")
    osm_id = element.get("id")

    latitude: float | None = None
    longitude: float | None = None
    if osm_type == "node":
        latitude, longitude = element.get("lat"), element.get("lon")
    else:
        center = element.get("center") or {}
        latitude, longitude = center.get("lat"), center.get("lon")
    if latitude is None or longitude is None or not (
        isinstance(latitude, (int, float)) and isinstance(longitude, (int, float))
    ):
        raise ValueError(f"{osm_type}/{osm_id} has no usable coordinates")

    name = (tags.get("name") or "").strip() if isinstance(tags.get("name"), str) else ""
    brand = _clean_tag(tags.get("brand"), max_len=100)
    operator = _clean_tag(tags.get("operator"))
    phone = _clean_tag(tags.get("phone") or tags.get("contact:phone"))
    website = _clean_tag(tags.get("website") or tags.get("contact:website"))
    opening_hours = _clean_tag(tags.get("opening_hours") or tags.get("fuel:opening_hours"))

    return {
        # --- exact StationImportRequest field set ---
        "name": name,
        "brand": brand,
        "address": build_address(tags),
        "city": resolve_city(tags),
        "state": resolve_state(tags, query_state),
        "latitude": round(float(latitude), 7),
        "longitude": round(float(longitude), 7),
        "fuel_type_codes": map_fuel_codes(tags),
        "source": SOURCE_NAME,
        "source_id": f"{osm_type}/{osm_id}",
        "data_source": DATA_SOURCE,
        "verification_status": VERIFICATION_STATUS,
        # --- provenance / enrichment captured from OSM (ignored by the
        # importer, kept for transparency) ---
        "operator": operator,
        "phone": phone,
        "website": website,
        "opening_hours": opening_hours,
        "osm_type": osm_type,
        "osm_id": osm_id,
    }


# --------------------------------------------------------------------------- #
# Deduplication
# --------------------------------------------------------------------------- #

#: Stations with the same normalised name within this distance (and with
#: compatible brand tags) are treated as the same physical station.
NAME_DEDUP_DISTANCE_M = 100.0

_RICHNESS_FIELDS = ("brand", "address", "city", "fuel_type_codes", "phone", "website", "opening_hours", "operator")


def _record_richness(record: dict[str, Any]) -> tuple[int, int, int]:
    """Richness key used to keep the better of two duplicate records."""
    filled = sum(1 for key in _RICHNESS_FIELDS if record.get(key))
    type_rank = {"node": 0, "way": 1, "relation": 2}.get(record.get("osm_type"), 3)
    return (filled, -type_rank, -(int(record.get("osm_id") or 0)))


def _same_station(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Obvious-duplicate test: same normalised name, near coords, compatible brands."""
    if _norm_name(a["name"]) != _norm_name(b["name"]):
        return False
    if haversine_metres(
        a["latitude"], a["longitude"], b["latitude"], b["longitude"]
    ) > NAME_DEDUP_DISTANCE_M:
        return False
    if a.get("brand") and b.get("brand") and a["brand"].lower() != b["brand"].lower():
        return False
    return True


def dedupe_records(records: Iterable[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Dedupe by ``source_id`` and by obvious name + proximity duplicates.

    Returns ``(unique_records, removed_count)``.  For each duplicate group
    the record with the most OSM information is kept (node preferred over
    way over relation on ties).
    """
    unique: list[dict[str, Any]] = []
    removed = 0
    seen_source_ids: set[str] = set()
    by_name: dict[str, list[list[dict[str, Any]]]] = {}  # norm name -> clusters

    for record in records:
        source_id = record["source_id"]
        if source_id in seen_source_ids:
            removed += 1
            continue
        seen_source_ids.add(source_id)

        norm = _norm_name(record["name"])
        if not norm:
            unique.append(record)
            continue
        clusters = by_name.setdefault(norm, [])
        placed = False
        for cluster in clusters:
            if _same_station(cluster[0], record):
                cluster.append(record)
                placed = True
                break
        if not placed:
            clusters.append([record])

    for clusters in by_name.values():
        for cluster in clusters:
            cluster.sort(key=_record_richness, reverse=True)
            unique.append(cluster[0])
            removed += len(cluster) - 1

    return unique, removed


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #

def validate_record_internal(record: dict[str, Any]) -> list[str]:
    """Schema/domain checks mirroring the importer (never DB-touching)."""
    errors: list[str] = []

    name = record.get("name") or ""
    if not name.strip():
        errors.append("station name cannot be empty")
    elif len(name) > 200:
        errors.append(f"station name exceeds 200 characters ({len(name)})")

    latitude, longitude = record.get("latitude"), record.get("longitude")
    if not isinstance(latitude, (int, float)) or not (-90.0 <= float(latitude) <= 90.0):
        errors.append("latitude must be in the range -90..90")
    if not isinstance(longitude, (int, float)) or not (-180.0 <= float(longitude) <= 180.0):
        errors.append("longitude must be in the range -180..180")

    if record.get("state") not in NIGERIAN_STATES:
        errors.append(f"state {record.get('state')!r} is not a recognised Nigerian state/FCT")

    if record.get("source") != SOURCE_NAME:
        errors.append(f"source must be {SOURCE_NAME!r}")

    source_id = record.get("source_id") or ""
    if not re.fullmatch(r"(node|way|relation)/\d+", source_id):
        errors.append(f"source_id {source_id!r} is not a valid OSM identity")

    unknown = sorted(set(record.get("fuel_type_codes") or []) - set(VALID_FUEL_CODES))
    if unknown:
        errors.append(f"unknown fuel type code(s): {', '.join(unknown)}")

    if record.get("data_source") != DATA_SOURCE:
        errors.append(f"data_source must be {DATA_SOURCE!r}")
    if record.get("verification_status") != VERIFICATION_STATUS:
        errors.append(f"verification_status must be {VERIFICATION_STATUS!r} — never verified")

    return errors


def load_backend_validator():
    """Import the project's real parser/validator if its deps are available.

    Returns ``parse_records`` from ``app.services.station_import`` or
    ``None`` when the backend environment isn't importable (the extractor
    itself must keep working standalone).
    """
    try:
        sys.path.insert(0, str(BACKEND_DIR))
        from app.services.station_import import parse_records  # type: ignore[import-not-found]

        return parse_records
    except Exception as exc:  # pragma: no cover - depends on the environment
        logging.debug("backend validator unavailable: %s", exc)
        return None


#: The exact keys accepted/required by ``StationImportRecord`` (enrichment
#: keys like phone/website are extras the importer silently ignores).
IMPORTER_FIELDS = (
    "name", "brand", "address", "city", "state", "latitude", "longitude",
    "fuel_type_codes", "source", "source_id", "data_source", "verification_status",
)


def validate_with_backend(parse_records, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Run the emitted records through the project's own importer parser.

    Returns per-record error dicts (empty list = every record importable).
    """
    payload = [{key: record[key] for key in IMPORTER_FIELDS} for record in records]
    _, per_index_errors = parse_records(payload)
    return per_index_errors


# --------------------------------------------------------------------------- #
# Extraction driver
# --------------------------------------------------------------------------- #

@dataclass
class StateOutcome:
    state: str
    status: str  # "ok" | "failed"
    endpoint_name: str | None = None
    endpoint_url: str | None = None
    from_cache: bool = False
    error: str | None = None
    attempts: int = 0
    duration_s: float = 0.0
    osm_timestamp: str | None = None
    elements_total: int = 0
    elements_without_coords: int = 0
    raw_without_name: int = 0
    raw_without_brand: int = 0
    raw_without_city: int = 0
    raw_without_fuel_info: int = 0
    records: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "status": self.status,
            "endpoint": self.endpoint_name,
            "from_cache": self.from_cache,
            "error": self.error,
            "attempts": self.attempts,
            "duration_seconds": round(self.duration_s, 2),
            "osm_base_timestamp": self.osm_timestamp,
            "elements_returned": self.elements_total,
            "elements_without_coordinates": self.elements_without_coords,
            "records_extracted": len(self.records),
        }


class _RequestGate:
    """Enforce a minimum interval between the *starts* of HTTP requests."""

    def __init__(self, min_interval: float):
        self.min_interval = max(0.0, min_interval)
        self._last_start = 0.0

    def wait(self) -> None:
        if self.min_interval <= 0:
            return
        now = time.monotonic()
        wait = self._last_start + self.min_interval - now
        if wait > 0:
            logging.debug("rate limit: sleeping %.1fs before next request", wait)
            time.sleep(wait)
        self._last_start = time.monotonic()


def _backoff_sleep(attempt: int, min_interval: float) -> None:
    delay = max(1.0, min_interval) * (2 ** (attempt - 1)) + random.uniform(0.0, 1.0)
    logging.info("backing off %.1fs before retry", delay)
    time.sleep(delay)


def _parse_elements(body_text: str) -> tuple[list[dict[str, Any]], str | None]:
    """Parse an Overpass JSON body; return (elements, osm_base_timestamp)."""
    payload = json.loads(body_text)
    if not isinstance(payload, dict):
        raise OverpassResponseError("response is not a JSON object")
    elements = payload.get("elements")
    if not isinstance(elements, list):
        remark = payload.get("remark")
        if isinstance(remark, str):
            raise OverpassResponseError(f"Overpass runtime error: {remark[:300]}")
        raise OverpassResponseError("response contains no 'elements' list")
    osm3s = payload.get("osm3s") or {}
    timestamp = osm3s.get("timestamp_osm_base") if isinstance(osm3s, dict) else None
    return elements, timestamp


def _run_query_over_endpoints(
    query: str,
    endpoints: tuple[tuple[str, str], ...],
    timeout: int,
    max_attempts_per_endpoint: int,
    min_interval: float,
    gate: _RequestGate,
    state: str,
) -> tuple[str, str, list[dict[str, Any]]]:
    """Run one Overpass query across the mirror chain with retries.

    Returns ``(endpoint_name, body_text, elements)``; raises
    ``OverpassResponseError`` when every endpoint and retry fails.
    """
    errors: list[str] = []
    for endpoint_name, endpoint_url in endpoints:
        for attempt in range(1, max_attempts_per_endpoint + 1):
            gate.wait()
            try:
                status, body_text, retry_after = request_overpass(endpoint_url, query, timeout)
                if status != 200:
                    raise HttpFailure(status, body_text, retry_after)
                elements, _ = _parse_elements(body_text)
                logging.info(
                    "%s: %d elements from %s (attempt %d)",
                    state, len(elements), endpoint_name, attempt,
                )
                return endpoint_name, body_text, elements
            except (HttpFailure, NetworkFailure, OverpassResponseError, json.JSONDecodeError, ValueError) as exc:
                message = str(exc)
                errors.append(f"{endpoint_name} attempt {attempt}: {message}")
                logging.warning("%s: %s", state, message)
                if isinstance(exc, HttpFailure) and exc.status == 429 and exc.retry_after:
                    try:
                        time.sleep(float(exc.retry_after))
                        continue
                    except ValueError:
                        pass
                _backoff_sleep(attempt, min_interval)
    raise OverpassResponseError(
        f"all {len(endpoints)} endpoint(s) failed after {max_attempts_per_endpoint} attempt(s) each; "
        f"last errors: {'; '.join(errors[-3:]) or 'unknown'}"
    )


def fetch_state(
    state: str,
    endpoints: tuple[tuple[str, str], ...],
    timeout: int,
    max_attempts_per_endpoint: int,
    min_interval: float,
    cache_dir: Path | None,
    gate: _RequestGate,
) -> tuple[str | None, str, list[dict[str, Any]]]:
    """Fetch and parse one state's elements over the mirror chain.

    The primary query uses the state's exact OSM administrative area
    (``area["ISO3166-2"=...]``).  If every mirror fails to resolve the
    area (e.g. a stale area database), the run falls back to the padded
    bounding-box query for that state.  Returns
    ``(endpoint_name, body_text, elements)`` on success and raises
    ``OverpassResponseError`` when both query forms fail everywhere.
    """
    area_query = build_area_query(state, timeout=timeout)
    try:
        endpoint_name, body_text, elements = _run_query_over_endpoints(
            area_query, endpoints, timeout, max_attempts_per_endpoint, min_interval, gate, state
        )
    except OverpassResponseError as area_error:
        logging.warning(
            "%s: area query failed on all endpoints (%s); falling back to bounding box",
            state, area_error,
        )
        bbox_query = build_bbox_query(state, timeout=timeout)
        try:
            endpoint_name, body_text, elements = _run_query_over_endpoints(
                bbox_query, endpoints, timeout, max_attempts_per_endpoint, min_interval, gate, state
            )
        except OverpassResponseError as bbox_error:
            raise OverpassResponseError(
                f"area query: {area_error}; bbox fallback: {bbox_error}"
            ) from bbox_error

    if cache_dir is not None:
        try:
            _write_cache(cache_dir, state, endpoint_name or "", build_overpass_query(state, timeout), 200, body_text)
        except OSError as exc:
            logging.warning("could not persist cache for %s: %s", state, exc)
    return endpoint_name, body_text, elements


def process_state(
    state: str,
    args: argparse.Namespace,
    gate: _RequestGate,
) -> StateOutcome:
    """Run one state through fetch (or cache) -> record extraction."""
    outcome = StateOutcome(state=state, status="failed")
    started = time.monotonic()
    body_text: str | None = None

    try:
        if args.use_cache:
            envelope = _read_cache(args.cache_dir, state)
            if envelope is None:
                raise OverpassResponseError("no cached Overpass response available (--use-cache)")
            body_text = envelope.get("body")
            if not isinstance(body_text, str):
                raise OverpassResponseError("cached response has no body")
            outcome.from_cache = True
            outcome.endpoint_name = envelope.get("endpoint") or "cache"
            outcome.endpoint_url = envelope.get("endpoint")
            _parse_elements(body_text)  # validate before processing
            logging.info("%s: using cached Overpass response", state)
        else:
            cache_dir: Path | None = None if args.no_cache_save else args.cache_dir
            endpoint_name, body_text, _ = fetch_state(
                state,
                args.endpoints,
                args.timeout,
                args.max_attempts_per_endpoint,
                args.interval,
                cache_dir,
                gate,
            )
            outcome.endpoint_name = endpoint_name

        elements, osm_timestamp = _parse_elements(body_text)
        outcome.osm_timestamp = osm_timestamp
        outcome.elements_total = len(elements)

        for element in elements:
            try:
                record = extract_record(element, state)
            except ValueError as exc:
                outcome.elements_without_coords += 1
                logging.debug("%s: skipping element: %s", state, exc)
                continue
            tags = element.get("tags") or {}
            if not (tags.get("name") or "").strip():
                outcome.raw_without_name += 1
            if not (tags.get("brand") or "").strip():
                outcome.raw_without_brand += 1
            if not any((tags.get(key) or "").strip() for key in CITY_TAG_KEYS):
                outcome.raw_without_city += 1
            if not map_fuel_codes(tags):
                outcome.raw_without_fuel_info += 1
            outcome.records.append(record)

        outcome.status = "ok"
    except (OverpassResponseError, OSError, json.JSONDecodeError, ValueError, KeyError) as exc:
        outcome.error = str(exc)
        logging.error("%s: FAILED — %s", state, exc)
    finally:
        outcome.duration_s = time.monotonic() - started
    return outcome


# --------------------------------------------------------------------------- #
# Report + output writing
# --------------------------------------------------------------------------- #

def build_report(
    *,
    args: argparse.Namespace,
    outcomes: list[StateOutcome],
    records: list[dict[str, Any]],
    duplicate_count: int,
    excluded: list[dict[str, Any]],
    endpoints_used: dict[str, int],
    backend_validation: dict[str, Any],
    skipped_by_limit: list[str],
) -> dict[str, Any]:
    successful = [o.state for o in outcomes if o.status == "ok"]
    failed = [
        {"state": o.state, "error": o.error, "endpoint": o.endpoint_name}
        for o in outcomes if o.status == "failed"
    ]

    records_by_state: dict[str, int] = {state: 0 for state in successful}
    records_by_fuel_type: dict[str, int] = {code: 0 for code in VALID_FUEL_CODES}
    stations_without_brands = 0
    stations_without_city = 0
    stations_without_fuel_info = 0
    stations_with_phone = 0
    stations_with_website = 0
    stations_with_opening_hours = 0
    stations_with_operator = 0
    for record in records:
        records_by_state[record["state"]] = records_by_state.get(record["state"], 0) + 1
        for code in record["fuel_type_codes"]:
            records_by_fuel_type[code] += 1
        if not record.get("brand"):
            stations_without_brands += 1
        if not record.get("city"):
            stations_without_city += 1
        if not record["fuel_type_codes"]:
            stations_without_fuel_info += 1
        if record.get("phone"):
            stations_with_phone += 1
        if record.get("website"):
            stations_with_website += 1
        if record.get("opening_hours"):
            stations_with_opening_hours += 1
        if record.get("operator"):
            stations_with_operator += 1

    raw_without_name = sum(o.raw_without_name for o in outcomes)
    excluded_counts: dict[str, int] = {}
    for item in excluded:
        for reason in item["errors"]:
            key = reason.split(":")[0]
            excluded_counts[key] = excluded_counts.get(key, 0) + 1

    endpoints_used_sorted = sorted(endpoints_used.items(), key=lambda kv: -kv[1])

    return {
        "extractor": {
            "script": "extract_nigeria_osm_fuel.py",
            "version": __version__,
            "source": SOURCE_NAME,
        },
        "extraction_timestamp": utc_now_iso(),
        "cache": {
            "used": bool(args.use_cache),
            "directory": str(args.cache_dir),
        },
        "total_stations": len(records),
        "raw_elements_extracted": sum(o.elements_total for o in outcomes),
        "successful_states": successful,
        "successful_state_count": len(successful),
        "failed_states": failed,
        "failed_state_count": len(failed),
        "skipped_by_limit": skipped_by_limit,
        "records_by_state": dict(sorted(records_by_state.items())),
        "records_by_fuel_type": records_by_fuel_type,
        "stations_without_fuel_information": stations_without_fuel_info,
        "stations_without_names": raw_without_name,
        "stations_without_brands": stations_without_brands,
        "stations_without_city": stations_without_city,
        "stations_with_coordinates": len(records),
        "stations_with_phone": stations_with_phone,
        "stations_with_website": stations_with_website,
        "stations_with_opening_hours": stations_with_opening_hours,
        "stations_with_operator": stations_with_operator,
        "duplicate_count": duplicate_count,
        "excluded_records": {
            "count": len(excluded),
            "reasons": excluded_counts,
            "details": excluded[:200],
        },
        "overpass_endpoints": {
            "configured": [name for name, _ in args.endpoints],
            "used": dict(endpoints_used_sorted),
        },
        "state_extraction": [outcome.to_dict() for outcome in outcomes],
        "backend_validation": backend_validation,
        "errors": [f"{item['state']}: {item['error']}" for item in failed],
        "attribution": OSM_ATTRIBUTION,
        "license": "ODbL 1.0",
        "notes": [
            "OSM/Overpass data is a community map, NOT official NMDPRA/NNPC "
            "verification; every record is unverified.",
            "Fuel types are only recorded when OSM tags explicitly say yes.",
        ],
    }


def write_outputs(
    output_dir: Path,
    records: list[dict[str, Any]],
    report: dict[str, Any],
) -> list[Path]:
    """Write the three output artefacts (JSON, CSV, report)."""
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / OUTPUT_JSON_NAME
    meta = {
        "generated_at": report["extraction_timestamp"],
        "extractor_version": __version__,
        "source": SOURCE_NAME,
        "attribution": OSM_ATTRIBUTION,
        "license": "ODbL 1.0",
        "total_stations": len(records),
        "note": (
            "records[] uses the exact StationImportRequest field set (plus "
            "informational OSM fields: operator, phone, website, "
            "opening_hours, osm_type, osm_id, which the importer ignores)."
        ),
    }
    json_path.write_text(
        json.dumps({"meta": meta, "records": records}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    csv_path = output_dir / OUTPUT_CSV_NAME
    fieldnames = [
        "name", "brand", "address", "city", "state", "latitude", "longitude",
        "fuel_type_codes", "source", "source_id", "data_source",
        "verification_status", "operator", "phone", "website", "opening_hours",
        "osm_type", "osm_id",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            row = dict(record)
            row["fuel_type_codes"] = "|".join(row.get("fuel_type_codes") or [])
            writer.writerow(row)

    report_path = output_dir / OUTPUT_REPORT_NAME
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return [json_path, csv_path, report_path]


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def _parse_endpoints(value: str | None) -> tuple[tuple[str, str], ...]:
    if not value:
        return DEFAULT_ENDPOINTS
    endpoints: list[tuple[str, str]] = []
    for index, item in enumerate(value.split(",")):
        item = item.strip()
        if not item:
            continue
        if "|" in item:
            name, url = item.split("|", 1)
            endpoints.append((name.strip() or f"endpoint-{index + 1}", url.strip()))
        else:
            endpoints.append((item, item))
    if not endpoints:
        raise argparse.ArgumentTypeError("endpoints list must not be empty")
    for _, url in endpoints:
        if not url.startswith(("http://", "https://")):
            raise argparse.ArgumentTypeError(f"invalid endpoint URL: {url}")
    return tuple(endpoints)


def _parse_states(value: str | None) -> list[str]:
    if value in (None, "", "all", "ALL"):
        return list(NIGERIAN_STATES)
    requested: list[str] = []
    for raw in re.split(r"[,\s]+", value.strip()):
        if not raw:
            continue
        if raw.lower() in {"abuja", "federal capital territory"}:
            requested.append("FCT")
            continue
        key = _state_key(raw)
        for state in NIGERIAN_STATES:
            if _state_key(state) == key:
                requested.append(state)
                break
        else:
            raise argparse.ArgumentTypeError(
                f"unknown state {raw!r} — must be one of the 36 states + FCT"
            )
    # De-duplicate while preserving canonical order.
    return [state for state in NIGERIAN_STATES if state in set(requested)]


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="extract_nigeria_osm_fuel.py",
        description=(
            "Extract genuine Nigerian fuel stations (amenity=fuel) from "
            "OpenStreetMap via public Overpass API endpoints and convert them "
            "to the station-import record format."
        ),
        epilog=(
            "Data (c) OpenStreetMap contributors, ODbL 1.0. OSM data is not "
            "official NMDPRA/NNPC verification; extracted stations are "
            "unverified by design."
        ),
    )
    parser.add_argument("--states", type=_parse_states, default=None, metavar="LIST",
                        help="comma/space separated states to process (default: all 36 + FCT)")
    parser.add_argument("--limit", type=int, default=0, metavar="N",
                        help="stop after extracting N valid records (0 = no limit; "
                             "useful for small test extractions)")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, metavar="DIR",
                        help=f"output directory (default: {DEFAULT_OUTPUT_DIR})")
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR, metavar="DIR",
                        help=f"raw-response cache directory (default: {DEFAULT_CACHE_DIR})")
    parser.add_argument("--use-cache", action="store_true",
                        help="replay cached Overpass responses only (no network requests)")
    parser.add_argument("--no-cache-save", action="store_true",
                        help="do not persist fetched Overpass responses to the cache")
    parser.add_argument("--overwrite", action="store_true",
                        help="allow overwriting existing output files")
    parser.add_argument("--timeout", type=int, default=60, metavar="SECONDS",
                        help="per-request HTTP timeout (default: 60)")
    parser.add_argument("--interval", type=float, default=3.0, metavar="SECONDS",
                        help="minimum interval between Overpass requests (default: 3.0)")
    parser.add_argument("--max-attempts-per-endpoint", type=int, default=2, metavar="N",
                        help="attempts per endpoint before failing over (default: 2)")
    parser.add_argument("--endpoints", type=_parse_endpoints, default=None, metavar="LIST",
                        help="comma-separated 'name|https://...' Overpass endpoints "
                             "(default: built-in public mirror list)")
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    parser.add_argument("-q", "--quiet", action="store_true", help="only warnings and errors")
    return parser


def check_outputs_free(output_dir: Path, overwrite: bool) -> list[Path]:
    existing = [
        path for name in (OUTPUT_JSON_NAME, OUTPUT_CSV_NAME, OUTPUT_REPORT_NAME)
        if (path := output_dir / name).exists()
    ]
    if existing and not overwrite:
        joined = ", ".join(str(p) for p in existing)
        raise SystemExit(
            f"refusing to overwrite existing output ({joined}).\n"
            "Re-run with --overwrite to replace these files."
        )
    return existing


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else (logging.WARNING if args.quiet else logging.INFO),
        format="%(asctime)s %(levelname)-7s %(message)s",
        stream=sys.stderr,
    )

    if args.limit < 0:
        parser.error("--limit must be >= 0")
    if args.timeout <= 0 or args.interval < 0 or args.max_attempts_per_endpoint < 1:
        parser.error("--timeout/--interval/--max-attempts-per-endpoint have invalid values")

    # Resolve the endpoint list once (default: built-in public mirror list).
    args.endpoints = args.endpoints or DEFAULT_ENDPOINTS

    states = args.states if args.states is not None else list(NIGERIAN_STATES)
    output_dir: Path = args.output_dir
    cache_dir: Path = args.cache_dir

    # Refuse to clobber previous results before doing any work.
    check_outputs_free(output_dir, args.overwrite)
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)

    logging.info("states to process (%d): %s", len(states), ", ".join(states))
    logging.info("endpoints in failover order: %s", ", ".join(name for name, _ in args.endpoints))
    if args.use_cache:
        logging.info("cache mode: no network requests will be made")
    elif args.no_cache_save:
        logging.info("cache saving disabled")
    if args.limit:
        logging.info("extraction limited to %d valid records", args.limit)

    gate = _RequestGate(args.interval)
    outcomes: list[StateOutcome] = []
    excluded: list[dict[str, Any]] = []
    endpoints_used: dict[str, int] = {}
    skipped_by_limit: list[str] = []
    raw_valid_total = 0

    for state in states:
        outcome = process_state(state, args, gate)
        outcomes.append(outcome)
        if outcome.status == "ok":
            if outcome.endpoint_name:
                endpoints_used[outcome.endpoint_name] = endpoints_used.get(outcome.endpoint_name, 0) + 1
            for record in outcome.records:
                problems = validate_record_internal(record)
                if problems:
                    excluded.append(
                        {"source_id": record["source_id"], "state": state, "errors": problems}
                    )
                else:
                    raw_valid_total += 1
        if args.limit and raw_valid_total >= args.limit:
            logging.info("limit of %d valid records reached; stopping early", args.limit)
            break

    skipped_by_limit = [s for s in states[len(outcomes):]]

    # Collect the validated records from every processed state.
    records: list[dict[str, Any]] = []
    for outcome in outcomes:
        for record in outcome.records:
            if not validate_record_internal(record):
                records.append(record)

    records, duplicate_count = dedupe_records(records)
    records.sort(key=lambda r: (
        NIGERIAN_STATES.index(r["state"]) if r["state"] in NIGERIAN_STATES else 99,
        r["name"].lower(),
        r["source_id"],
    ))
    if args.limit:
        records = records[: args.limit]

    backend_validation: dict[str, Any] = {"available": False}
    parse_records = load_backend_validator()
    if parse_records is not None:
        backend_errors = validate_with_backend(parse_records, records)
        backend_validation = {
            "available": True,
            "validator": "app.services.station_import.parse_records",
            "records_checked": len(records),
            "records_rejected_by_backend": len(backend_errors),
            "errors": backend_errors[:50],
        }
        if backend_errors:
            logging.error("backend importer rejected %d record(s) — see report", len(backend_errors))
        else:
            logging.info("backend importer validation passed for all %d record(s)", len(records))

    report = build_report(
        args=args,
        outcomes=outcomes,
        records=records,
        duplicate_count=duplicate_count,
        excluded=excluded,
        endpoints_used=endpoints_used,
        backend_validation=backend_validation,
        skipped_by_limit=skipped_by_limit,
    )

    paths = write_outputs(output_dir, records, report)
    for path in paths:
        logging.info("wrote %s", path)

    failed_states = [item["state"] for item in report["failed_states"]]
    print(
        f"Extraction complete: {len(records)} stations from "
        f"{len(report['successful_states'])} state(s), {duplicate_count} duplicates removed, "
        f"{len(failed_states)} state(s) failed, {len(excluded)} record(s) excluded."
    )
    if failed_states:
        print(f"Failed states: {', '.join(failed_states)} — details in the report.")
    if skipped_by_limit:
        print(f"Skipped by --limit: {', '.join(skipped_by_limit)}")

    if not records and report["successful_state_count"] == 0:
        return 3  # nothing extracted at all (report still written)
    if failed_states:
        return 2  # partial success
    return 0


if __name__ == "__main__":
    sys.exit(main())
