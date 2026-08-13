"""
Tests for the station import service (Phase 3 — real-data ingestion).

Covers every validation rule (name, latitude/longitude ranges, recognised
Nigerian state, required source, fuel-type codes), record parsing with
per-index errors, and the idempotent upsert behaviour (dedupe by source_id,
dedupe by (name, city), seed-row promotion, no duplicates on re-import)
against the portable SQLite schema.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.models import FuelStation, StationDataSource, StationVerificationStatus
from app.services.station_import import (
    NIGERIAN_STATES,
    StationImportRecord,
    import_stations_sync,
    parse_records,
    validate_record,
)


# --------------------------------------------------------------------------- #
# Record validation (pure)
# --------------------------------------------------------------------------- #
def _record(**overrides) -> StationImportRecord:
    base = {
        "name": "NNPC Retail Test",
        "brand": "NNPC",
        "address": "1 Test Road",
        "city": "Kaduna",
        "state": "Kaduna",
        "latitude": 10.5207,
        "longitude": 7.4386,
        "fuel_type_codes": ["PMS", "AGO"],
        "source": "NMDPRA-2025",
        "source_id": "NG-001",
    }
    base.update(overrides)
    return StationImportRecord(**base)


def test_valid_record_has_no_errors() -> None:
    assert validate_record(_record()) == []


def test_empty_name_rejected() -> None:
    errors = validate_record(_record(name="   "))
    assert any("name cannot be empty" in e for e in errors)


@pytest.mark.parametrize(
    "field,value",
    [("latitude", 95.0), ("latitude", -91.0), ("longitude", 181.0), ("longitude", -181.0)],
)
def test_out_of_range_coordinates_rejected_by_schema(field: str, value: float) -> None:
    """Pydantic rejects coordinates outside -90..90 / -180..180 before they
    can reach the database (the API surfaces this as a 422 per record)."""
    with pytest.raises(Exception):
        _record(**{field: value})


def test_coordinate_domain_validation_defensive() -> None:
    """``validate_record`` enforces the same ranges as a defence in depth
    (unvalidated records — e.g. from an internal caller — are still caught)."""
    record = StationImportRecord.model_construct(
        name="X",
        latitude=95.0,
        longitude=7.0,
        state="Kaduna",
        source="SRC",
        fuel_type_codes=[],
    )
    errors = validate_record(record)
    assert any("latitude" in e and "-90..90" in e for e in errors)
    record = StationImportRecord.model_construct(
        name="X",
        latitude=10.0,
        longitude=181.0,
        state="Kaduna",
        source="SRC",
        fuel_type_codes=[],
    )
    errors = validate_record(record)
    assert any("longitude" in e and "-180..180" in e for e in errors)


def test_invalid_state_rejected() -> None:
    errors = validate_record(_record(state="Timbuktu"))
    assert any("not a recognised Nigerian state" in e for e in errors)


def test_missing_state_rejected() -> None:
    errors = validate_record(_record(state=None))
    assert any("state is required" in e for e in errors)


def test_fct_spellings_normalised() -> None:
    assert _record(state="fct").state == "FCT"
    assert _record(state="Abuja").state == "FCT"
    assert _record(state="Federal Capital Territory").state == "FCT"


def test_missing_source_rejected() -> None:
    errors = validate_record(_record(source="   "))
    assert any("source cannot be empty" in e for e in errors)


def test_unknown_fuel_type_rejected() -> None:
    errors = validate_record(_record(fuel_type_codes=["PMS", "JET"]))
    assert any("unknown fuel type code" in e and "JET" in e for e in errors)


def test_all_36_states_plus_fct_recognised() -> None:
    assert len(NIGERIAN_STATES) == 37
    for state in ["Lagos", "Kaduna", "FCT", "Rivers", "Cross River", "Yobe", "Zamfara"]:
        assert state in NIGERIAN_STATES


def test_abuja_is_normalised_to_fct_not_a_state_alias() -> None:
    """'Abuja' is a city, not a state — records referencing it are normalised
    to the FCT state by the record validator."""
    assert "Abuja" not in NIGERIAN_STATES
    assert _record(state="Abuja").state == "FCT"


@pytest.mark.parametrize("field", ["name", "source"])
def test_pydantic_rejects_blank_required_strings(field: str) -> None:
    with pytest.raises(Exception):
        _record(**{field: ""})


def test_imported_records_default_to_unverified_imported() -> None:
    record = _record()
    assert record.data_source == StationDataSource.IMPORTED
    assert record.verification_status == StationVerificationStatus.UNVERIFIED


# --------------------------------------------------------------------------- #
# parse_records — mixed batches
# --------------------------------------------------------------------------- #
def test_parse_records_separates_valid_and_invalid() -> None:
    good = _record().model_dump()
    bad_lat = {"name": "Bad Lat", "state": "Kaduna", "latitude": 200.0,
               "longitude": 7.4, "source": "SRC"}
    bad_state = _record(name="Bad State", state="Atlantis").model_dump()

    records, errors = parse_records([good, bad_lat, bad_state])

    assert len(records) == 1
    assert records[0].name == "NNPC Retail Test"
    assert [e["index"] for e in errors] == [1, 2]
    assert all(e["errors"] for e in errors)


def test_parse_records_all_valid() -> None:
    records, errors = parse_records([_record().model_dump(), _record(name="Two").model_dump()])
    assert len(records) == 2
    assert errors == []


# --------------------------------------------------------------------------- #
# Idempotent upsert (portable SQLite, real service code)
# --------------------------------------------------------------------------- #
def test_import_inserts_then_updates_same_record(portable_sync_session) -> None:
    record = _record()
    factory = portable_sync_session

    with factory() as session:
        summary = import_stations_sync(session, [record])
        assert summary.imported == 1
        assert summary.updated == 0
        total = session.execute(select(func.count(FuelStation.id))).scalar_one()
        assert total == 1

    # Re-importing the identical record must NOT duplicate it.
    with factory() as session:
        summary = import_stations_sync(session, [record])
        assert summary.imported == 0
        assert summary.updated == 1
        total = session.execute(select(func.count(FuelStation.id))).scalar_one()
        assert total == 1


def test_import_dedupes_by_source_id(portable_sync_session) -> None:
    factory = portable_sync_session
    record = _record()

    with factory() as session:
        import_stations_sync(session, [record])
        # Same source_id, different display name → still one row (source_id is
        # the stronger identity for imported records).
        renamed = _record(name="NNPC Retail Renamed")
        summary = import_stations_sync(session, [renamed])
        assert summary.updated == 1
        total = session.execute(select(func.count(FuelStation.id))).scalar_one()
        assert total == 1
        row = session.execute(
            select(FuelStation.name).where(FuelStation.source_id == "NG-001")
        ).scalar_one()
        assert row == "NNPC Retail Renamed"


def test_import_dedupes_by_name_city_when_no_source_id(portable_sync_session) -> None:
    factory = portable_sync_session
    record = _record(source_id=None)

    with factory() as session:
        import_stations_sync(session, [record])
        duplicate = _record(source_id=None, source="OTHER-SRC")
        summary = import_stations_sync(session, [duplicate])
        assert summary.updated == 1
        assert summary.imported == 0
        total = session.execute(select(func.count(FuelStation.id))).scalar_one()
        assert total == 1


def test_import_stores_provenance_and_source(portable_sync_session) -> None:
    record = _record()
    with portable_sync_session() as session:
        import_stations_sync(session, [record])
        row = session.execute(
            select(
                FuelStation.data_source,
                FuelStation.verification_status,
                FuelStation.source_id,
                FuelStation.state,
                FuelStation.city,
            ).where(FuelStation.name == record.name)
        ).one()
    assert row.data_source == StationDataSource.IMPORTED
    assert row.verification_status == StationVerificationStatus.UNVERIFIED
    assert row.source_id == "NG-001"
    assert row.state == "Kaduna"
    assert row.city == "Kaduna"


def test_import_never_fabricates_phone_numbers(portable_sync_session) -> None:
    with portable_sync_session() as session:
        import_stations_sync(session, [_record()])
        phone = session.execute(
            select(FuelStation.phone).where(FuelStation.name == "NNPC Retail Test")
        ).scalar_one()
    assert phone is None


def test_import_preserves_explicit_verification_metadata(portable_sync_session) -> None:
    from datetime import datetime, timezone

    verified_at = datetime(2025, 6, 1, tzinfo=timezone.utc)
    record = _record(
        data_source=StationDataSource.GOVERNMENT,
        verification_status=StationVerificationStatus.VERIFIED,
        verified_at=verified_at,
    )
    with portable_sync_session() as session:
        import_stations_sync(session, [record])
        row = session.execute(
            select(
                FuelStation.data_source,
                FuelStation.verification_status,
                FuelStation.verified_at,
                FuelStation.last_verified_at,
            ).where(FuelStation.source_id == "NG-001")
        ).one()
    assert row.data_source == StationDataSource.GOVERNMENT
    assert row.verification_status == StationVerificationStatus.VERIFIED
    # SQLite stores naive datetimes — compare without tzinfo.
    assert row.verified_at == verified_at.replace(tzinfo=None)
    assert row.last_verified_at == verified_at.replace(tzinfo=None)
