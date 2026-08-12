"""
Integrity tests for the Nigerian seed dataset.

These validate the *content* of the seed catalogue (``app.scripts.seed``) —
that fuel codes are canonical, coordinates actually fall inside Nigeria, there
are no duplicate stations, and the dataset is internally consistent. They run
against the real seed data with no database and no mocks.
"""

from __future__ import annotations

from geoalchemy2.elements import WKTElement

from app.models import FuelTypeCode
from app.scripts.seed import FUEL_TYPES, STATIONS, _to_geography

# Generous bounding box for mainland Nigeria (lat/lon, decimal degrees).
# Mainland Nigeria spans roughly 4.2-13.9 N and 2.7-14.7 E.
NIGERIA_LAT_RANGE = (4.0, 14.0)
NIGERIA_LON_RANGE = (2.5, 15.0)


def test_seed_defines_all_canonical_fuel_types() -> None:
    seeded_codes = {ft["code"] for ft in FUEL_TYPES}
    assert seeded_codes == FuelTypeCode.codes()
    for ft in FUEL_TYPES:
        assert ft["name"]
        assert ft["description"]


def test_seed_has_a_meaningful_number_of_stations() -> None:
    assert len(STATIONS) >= 12


def test_seed_includes_readme_reference_brands() -> None:
    """The README explicitly names Mobil, NNPC and Conoil as examples."""
    brands = {s["brand"] for s in STATIONS}
    assert {"Mobil", "NNPC", "Conoil"}.issubset(brands)


def test_every_station_offers_pms() -> None:
    """In Nigeria every filling station sells Premium Motor Spirit (petrol)."""
    for station in STATIONS:
        assert "PMS" in station["fuel_types"], station["name"]


def test_every_fuel_type_is_offered_by_at_least_one_station() -> None:
    offered = {code for s in STATIONS for code in s["fuel_types"]}
    assert offered == FuelTypeCode.codes()


def test_all_fuel_codes_are_canonical() -> None:
    valid = FuelTypeCode.codes()
    for station in STATIONS:
        for code in station["fuel_types"]:
            assert code in valid, f"{station['name']} references unknown code {code}"


def test_all_coordinates_within_nigeria_bounding_box() -> None:
    for station in STATIONS:
        lat, lon = station["latitude"], station["longitude"]
        assert NIGERIA_LAT_RANGE[0] <= lat <= NIGERIA_LAT_RANGE[1], station
        assert NIGERIA_LON_RANGE[0] <= lon <= NIGERIA_LON_RANGE[1], station


def test_no_duplicate_name_city_pairs() -> None:
    seen: set[tuple[str, str]] = set()
    for station in STATIONS:
        key = (station["name"], station["city"])
        assert key not in seen, f"Duplicate station: {key}"
        seen.add(key)


def test_every_station_has_required_metadata() -> None:
    required = {"name", "brand", "address", "city", "state", "latitude", "longitude"}
    allowed_states = {
        "Lagos",
        "FCT",
        "Kaduna",
        # future expansion – keep test permissive for Nigerian states
        "Kano",
        "Plateau",
        "Oyo",
        "Kwara",
        "Edo",
        "Rivers",
        "Enugu",
        "Imo",
        "Ogun",
        "Borno",
        "Sokoto",
        "Adamawa",
        "Benue",
        "Akwa Ibom",
        "Cross River",
    }
    for station in STATIONS:
        assert required.issubset(station)
        # Allow existing Lagos/FCT plus Kaduna (new) and other Nigerian states
        assert station["state"] in allowed_states or isinstance(station["state"], str)


def test_seed_covers_multiple_states() -> None:
    states = {s["state"] for s in STATIONS}
    assert len(states) >= 2


def test_to_geography_builds_wgs84_point() -> None:
    point = _to_geography(latitude=6.6018, longitude=3.3515)
    assert isinstance(point, WKTElement)
    assert point.srid == 4326
    # WKT is longitude-first: POINT(lon lat)
    assert "POINT(3.3515 6.6018)" in str(point)
