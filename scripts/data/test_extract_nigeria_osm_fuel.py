"""
Tests for the OSM/Overpass fuel-station extractor
(``scripts/data/extract_nigeria_osm_fuel.py``).

These tests exercise the pure pipeline (tag mapping, state normalisation,
record shape, dedup, validation, output writing) and the retry/failover
logic of the Overpass fetcher — using only synthetic *fixture* elements,
never fabricated station records as extraction output.

Run from the repository root:

    python -m pytest scripts/data/test_extract_nigeria_osm_fuel.py -q

or directly (no pytest required):

    python scripts/data/test_extract_nigeria_osm_fuel.py
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

try:  # pytest is optional for the plain-python runner
    import pytest  # noqa: F401
except ImportError:  # pragma: no cover
    pytest = None  # type: ignore[assignment]

REPO_ROOT = Path(__file__).resolve().parents[2]

_SPEC = importlib.util.spec_from_file_location(
    "extract_nigeria_osm_fuel", REPO_ROOT / "scripts" / "data" / "extract_nigeria_osm_fuel.py"
)
assert _SPEC is not None and _SPEC.loader is not None
extract = importlib.util.module_from_spec(_SPEC)
sys.modules["extract_nigeria_osm_fuel"] = extract
_SPEC.loader.exec_module(extract)


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

def _node(**overrides):
    element = {
        "type": "node",
        "id": 123456,
        "lat": 6.4512,
        "lon": 3.3911,
        "tags": {
            "amenity": "fuel",
            "name": "Total Lekki",
            "brand": "Total",
            "addr:street": "Lekki-Epe Expressway",
            "addr:city": "Lagos",
            "addr:state": "Lagos State",
            "fuel:petrol": "yes",
            "fuel:diesel": "yes",
            "phone": "+234 1 234 5678",
            "opening_hours": "24/7",
        },
    }
    element.update(overrides)
    return element


def _overpass_body(elements):
    return json.dumps(
        {
            "version": 0.6,
            "generator": "Overpass API 0.7.62 test",
            "osm3s": {"timestamp_osm_base": "2026-08-14T00:00:00Z"},
            "elements": elements,
        }
    )


def _write_cache(tmp_path: Path, state: str, elements) -> Path:
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    body = _overpass_body(elements)
    extract._write_cache(
        cache_dir,
        state,
        endpoint="https://example.test/api/interpreter",
        query=extract.build_overpass_query(state),
        status=200,
        body_text=body,
    )
    return cache_dir


# --------------------------------------------------------------------------- #
# Constants / query building
# --------------------------------------------------------------------------- #

def test_all_36_states_plus_fct_have_bboxes() -> None:
    assert set(extract.STATE_BBOXES) == set(extract.NIGERIAN_STATES)
    assert len(extract.NIGERIAN_STATES) == 37
    assert "FCT" in extract.NIGERIAN_STATES
    for state, (south, west, north, east) in extract.STATE_BBOXES.items():
        assert south < north and west < east, state
        assert -90 <= south <= 90 and -90 <= north <= 90
        assert -180 <= west <= 180 and -180 <= east <= 180


def test_build_area_query() -> None:
    query = extract.build_area_query("Adamawa")
    assert query.startswith("[out:json]")
    assert 'area["ISO3166-2"="NG-AD"]' in query
    assert 'node["amenity"="fuel"]' in query
    assert 'way["amenity"="fuel"]' in query
    assert 'relation["amenity"="fuel"]' in query
    assert "out center tags" in query


def test_build_bbox_query() -> None:
    query = extract.build_bbox_query("Lagos")
    assert query.startswith("[out:json]")
    assert 'node["amenity"="fuel"]' in query
    assert "out center tags" in query
    assert "6.35,2.65,6.8,4.45" in query


def test_iso3166_2_codes_cover_all_states() -> None:
    assert set(extract.STATE_ISO3166_2) == set(extract.NIGERIAN_STATES)
    assert all(code.startswith("NG-") for code in extract.STATE_ISO3166_2.values())
    assert extract.STATE_ISO3166_2["FCT"] == "NG-FC"


# --------------------------------------------------------------------------- #
# State normalisation
# --------------------------------------------------------------------------- #

def test_normalise_state_variants() -> None:
    assert extract.normalise_state("Lagos State") == "Lagos"
    assert extract.normalise_state("Ondo State") == "Ondo"
    assert extract.normalise_state("Akwa-Ibom") == "Akwa Ibom"
    assert extract.normalise_state("Cross River State") == "Cross River"
    assert extract.normalise_state("Nassarawa") == "Nasarawa"
    assert extract.normalise_state("Abuja") == "FCT"
    assert extract.normalise_state("Federal Capital Territory") == "FCT"
    assert extract.normalise_state("F.C.T") == "FCT"
    assert extract.normalise_state("Nigeria") is None
    assert extract.normalise_state("") is None


def test_resolve_state_prefers_tags_then_query_state() -> None:
    assert extract.resolve_state({"addr:state": "Ondo State"}, "Lagos") == "Ondo"
    assert extract.resolve_state({"is_in": "Kano State, Nigeria"}, "Lagos") == "Kano"
    assert extract.resolve_state({"addr:state": "Somewhere-else"}, "Lagos") == "Lagos"
    assert extract.resolve_state({}, "FCT") == "FCT"


# --------------------------------------------------------------------------- #
# Fuel mapping
# --------------------------------------------------------------------------- #

def test_fuel_mapping_canonical_and_variants() -> None:
    tags = {
        "fuel:petrol": "yes",
        "fuel:gasoline": "yes",
        "fuel:pms": "yes",
        "fuel:octane_95": "yes",
        "fuel:diesel": "yes",
        "fuel:ago": "yes",
        "fuel:kerosene": "yes",
        "fuel:kerosine": "yes",
        "fuel:dpk": "yes",
        "fuel:lpg": "yes",
        "fuel:cng": "yes",
    }
    assert extract.map_fuel_codes(tags) == ["PMS", "AGO", "DPK", "LPG", "CNG"]


def test_fuel_mapping_case_insensitive_keys() -> None:
    assert extract.map_fuel_codes({"fuel:Petrol": "yes", "fuel:CNG": "yes"}) == ["PMS", "CNG"]


def test_fuel_mapping_negative_and_unknown_ignored() -> None:
    assert extract.map_fuel_codes({"fuel:diesel": "no"}) == []
    assert extract.map_fuel_codes({"fuel:diesel": "false"}) == []
    assert extract.map_fuel_codes({"fuel:diesel": ""}) == []
    assert extract.map_fuel_codes({"fuel:electricity": "yes"}) == []
    assert extract.map_fuel_codes({"fuel:adblue": "yes"}) == []
    assert extract.map_fuel_codes({}) == []


# --------------------------------------------------------------------------- #
# Record extraction
# --------------------------------------------------------------------------- #

def test_extract_node_record_shape() -> None:
    record = extract.extract_record(_node(), "Lagos")
    assert record["name"] == "Total Lekki"
    assert record["brand"] == "Total"
    assert record["address"] == "Lekki-Epe Expressway"
    assert record["city"] == "Lagos"
    assert record["state"] == "Lagos"
    assert record["latitude"] == 6.4512
    assert record["longitude"] == 3.3911
    assert record["fuel_type_codes"] == ["PMS", "AGO"]
    assert record["source"] == "OSM-Overpass"
    assert record["source_id"] == "node/123456"
    assert record["data_source"] == "imported"
    assert record["verification_status"] == "unverified"
    assert record["osm_type"] == "node"
    assert record["osm_id"] == 123456
    assert record["phone"] == "+234 1 234 5678"
    assert record["opening_hours"] == "24/7"


def test_extract_way_uses_center_coordinate() -> None:
    element = {
        "type": "way",
        "id": 987654,
        "center": {"lat": 9.0572, "lon": 7.4913},
        "tags": {"amenity": "fuel", "name": "NNPC Garki"},
    }
    record = extract.extract_record(element, "FCT")
    assert record["source_id"] == "way/987654"
    assert record["latitude"] == 9.0572
    assert record["longitude"] == 7.4913
    assert record["state"] == "FCT"
    assert record["city"] is None
    assert record["address"] is None
    assert record["fuel_type_codes"] == []
    assert extract.validate_record_internal(record) == []


def test_extract_element_without_coordinates_raises() -> None:
    try:
        extract.extract_record({"type": "way", "id": 1, "tags": {}}, "Lagos")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_address_built_only_from_address_tags() -> None:
    assert extract.build_address({"addr:full": "1 Test Road, Ikeja"}) == "1 Test Road, Ikeja"
    assert extract.build_address({"addr:housenumber": "12", "addr:street": "Awolowo Way"}) == "12, Awolowo Way"
    assert extract.build_address({"addr:housename": "Ibrahim Babangida Way"}) == "Ibrahim Babangida Way"
    assert extract.build_address({"name": "A station"}) is None
    assert extract.build_address({}) is None


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #

def test_validate_record_accepts_minimal_record() -> None:
    record = {
        "name": "A Station", "brand": None, "address": None, "city": None,
        "state": "Kaduna", "latitude": 10.5, "longitude": 7.4,
        "fuel_type_codes": [], "source": "OSM-Overpass",
        "source_id": "node/1", "data_source": "imported",
        "verification_status": "unverified",
    }
    assert extract.validate_record_internal(record) == []


def test_validate_record_rejects_problems() -> None:
    base = {
        "name": "A Station", "state": "Kaduna", "latitude": 10.5, "longitude": 7.4,
        "fuel_type_codes": [], "source": "OSM-Overpass", "source_id": "node/1",
        "data_source": "imported", "verification_status": "unverified",
    }
    assert any("name" in e for e in extract.validate_record_internal({**base, "name": "  "}))
    assert any("latitude" in e for e in extract.validate_record_internal({**base, "latitude": 95.0}))
    assert any("state" in e for e in extract.validate_record_internal({**base, "state": "Atlantis"}))
    assert any("fuel" in e for e in extract.validate_record_internal({**base, "fuel_type_codes": ["JET-A1"]}))
    assert any("source_id" in e for e in extract.validate_record_internal({**base, "source_id": "node/abc"}))
    assert any("verified" in e for e in extract.validate_record_internal({**base, "verification_status": "verified"}))
    assert any("source" in e for e in extract.validate_record_internal({**base, "source": "elsewhere"}))


# --------------------------------------------------------------------------- #
# Deduplication
# --------------------------------------------------------------------------- #

def _record(source_id: str, name: str, lat: float, lon: float, **extra) -> dict:
    record = {
        "name": name, "brand": extra.pop("brand", None), "address": extra.pop("address", None),
        "city": None, "state": "Lagos", "latitude": lat, "longitude": lon,
        "fuel_type_codes": [], "source": "OSM-Overpass", "source_id": source_id,
        "data_source": "imported", "verification_status": "unverified",
        "osm_type": "node", "osm_id": int(source_id.split("/")[1]),
    }
    record.update(extra)
    return record


def test_dedupe_by_source_id() -> None:
    records = [_record("node/1", "A", 6.5, 3.4), _record("node/1", "A", 6.6, 3.5)]
    unique, removed = extract.dedupe_records(records)
    assert removed == 1 and len(unique) == 1


def test_dedupe_by_name_and_proximity_keeps_richer_record() -> None:
    records = [
        _record("node/1", "NNPC Garki", 9.05, 7.49, brand="NNPC", address="Aminu Kano Crescent"),
        _record("node/2", "NNPC Garki", 9.05004, 7.49004, brand="NNPC"),
        _record("node/3", "NNPC Garki", 9.06, 7.50, brand="NNPC"),  # > 100 m away: distinct
    ]
    unique, removed = extract.dedupe_records(records)
    assert removed == 1 and len(unique) == 2
    kept = next(r for r in unique if r["source_id"] in ("node/1", "node/2"))
    assert kept["source_id"] == "node/1" and kept["address"] == "Aminu Kano Crescent"


def test_dedupe_keeps_same_name_different_brand() -> None:
    records = [
        _record("node/1", "Fuel Mart", 9.05, 7.49, brand="Total"),
        _record("node/2", "Fuel Mart", 9.05001, 7.49001, brand="Oando"),
    ]
    unique, removed = extract.dedupe_records(records)
    assert removed == 0 and len(unique) == 2


# --------------------------------------------------------------------------- #
# Fetch retry / failover logic
# --------------------------------------------------------------------------- #

def test_fetch_state_fails_over_endpoints_and_retries(monkeypatch) -> None:
    calls = []

    def fake_request(endpoint: str, query: str, timeout: int):
        calls.append(endpoint)
        if endpoint == "https://first.test/api/interpreter":
            raise extract.HttpFailure(503, "unavailable")
        return 200, _overpass_body([_node()]), None

    monkeypatch.setattr(extract, "request_overpass", fake_request)
    monkeypatch.setattr(extract.time, "sleep", lambda _: None)
    endpoints = (("first", "https://first.test/api/interpreter"), ("second", "https://second.test/api/interpreter"))
    name, body, elements = extract.fetch_state(
        "Lagos", endpoints, timeout=10, max_attempts_per_endpoint=1,
        min_interval=0, cache_dir=None, gate=extract._RequestGate(0),
    )
    assert name == "second"
    assert calls == ["https://first.test/api/interpreter", "https://second.test/api/interpreter"]
    assert len(elements) == 1


def test_fetch_state_raises_when_all_endpoints_fail(monkeypatch) -> None:
    def fake_request(endpoint: str, query: str, timeout: int):
        raise extract.NetworkFailure("connection reset")

    monkeypatch.setattr(extract, "request_overpass", fake_request)
    monkeypatch.setattr(extract.time, "sleep", lambda _: None)
    with pytest.raises(extract.OverpassResponseError, match="all 2 endpoint"):
        extract.fetch_state(
            "Lagos", (("a", "https://a.test/"), ("b", "https://b.test/")),
            timeout=10, max_attempts_per_endpoint=2, min_interval=0,
            cache_dir=None, gate=extract._RequestGate(0),
        )


# --------------------------------------------------------------------------- #
# End-to-end offline pipeline (cache -> outputs)
# --------------------------------------------------------------------------- #

def test_full_pipeline_from_cache_writes_expected_outputs(tmp_path, monkeypatch) -> None:
    elements = [
        _node(),
        _node(id=2, tags={"amenity": "fuel", "name": "Mobil VI", "brand": "Mobil",
                          "fuel:cng": "yes"}),
        _node(id=3, tags={"amenity": "fuel"}),  # no name -> excluded
    ]
    cache_dir = _write_cache(tmp_path, "Lagos", elements)
    output_dir = tmp_path / "output"

    code = extract.main([
        "--use-cache", "--states", "Lagos",
        "--cache-dir", str(cache_dir), "--output-dir", str(output_dir),
        "--overwrite",
    ])
    assert code == 0

    payload = json.loads((output_dir / extract.OUTPUT_JSON_NAME).read_text())
    assert set(payload) == {"meta", "records"}
    assert len(payload["records"]) == 2
    for record in payload["records"]:
        assert record["source"] == "OSM-Overpass"
        assert record["source_id"].startswith("node/")
        assert record["verification_status"] == "unverified"
        assert record["data_source"] == "imported"
        assert record["state"] == "Lagos"
        assert -90 <= record["latitude"] <= 90 and -180 <= record["longitude"] <= 180
        assert set(record["fuel_type_codes"]) <= set(extract.VALID_FUEL_CODES)
        assert record["name"].strip()
        assert extract.validate_record_internal(record) == []

    report = json.loads((output_dir / extract.OUTPUT_REPORT_NAME).read_text())
    assert report["total_stations"] == 2
    assert report["successful_states"] == ["Lagos"]
    assert report["stations_without_names"] == 1
    assert report["excluded_records"]["count"] == 1
    assert report["duplicate_count"] == 0
    for key in (
        "extraction_timestamp", "total_stations", "successful_states", "failed_states",
        "records_by_state", "records_by_fuel_type", "stations_without_fuel_information",
        "stations_without_names", "stations_without_brands", "stations_without_city",
        "stations_with_coordinates", "duplicate_count", "overpass_endpoints", "errors",
    ):
        assert key in report, key

    csv_lines = (output_dir / extract.OUTPUT_CSV_NAME).read_text().splitlines()
    assert csv_lines[0].startswith("name,brand,address,city,state,latitude,longitude")
    assert len(csv_lines) == 3  # header + 2 records


def test_main_refuses_to_overwrite_existing_outputs(tmp_path) -> None:
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    (output_dir / extract.OUTPUT_JSON_NAME).write_text("{}")
    with pytest.raises(SystemExit) as excinfo:
        extract.main(["--use-cache", "--states", "Lagos",
                      "--output-dir", str(output_dir), "--cache-dir", str(tmp_path / "cache")])
    assert "refusing to overwrite" in str(excinfo.value)


if __name__ == "__main__":
    # Plain-python runner (no pytest needed): runs the fixture-free tests
    # only. The fixture-dependent tests (tmp_path/monkeypatch) require
    # pytest: python -m pytest scripts/data/test_extract_nigeria_osm_fuel.py
    import inspect

    failures = 0
    run = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        params = inspect.signature(fn).parameters
        if params:
            continue  # needs pytest fixtures
        run += 1
        try:
            fn()
            print(f"PASS {name}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAIL {name}: {exc!r}")
    print(f"{run} fixture-free tests run; pytest-dependent tests need: "
          "python -m pytest scripts/data/test_extract_nigeria_osm_fuel.py")
    sys.exit(1 if failures else 0)
