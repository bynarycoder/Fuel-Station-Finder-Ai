"""Tests for the direct OSM station database import command."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models import StationDataSource, StationVerificationStatus
from app.scripts import import_osm_stations as cli
from app.services.station_import import ImportSummary


def _record(**overrides) -> dict:
    record = {
        "name": "OSM Station",
        "brand": "Mapped Brand",
        "address": "1 Mapped Road",
        "city": "Kaduna",
        "state": "Kaduna",
        "latitude": 10.5207,
        "longitude": 7.4386,
        "fuel_type_codes": ["PMS", "AGO"],
        "source": "OSM-Overpass",
        "source_id": "node/123",
        "data_source": "imported",
        "verification_status": "unverified",
    }
    record.update(overrides)
    return record


def _write_dataset(path: Path, records: list[object]) -> None:
    path.write_text(
        json.dumps({"meta": {"total_stations": len(records)}, "records": records}),
        encoding="utf-8",
    )


def test_load_dataset_reads_extractor_envelope_without_changing_records(
    tmp_path: Path,
) -> None:
    path = tmp_path / "stations.json"
    expected = [_record()]
    _write_dataset(path, expected)

    assert cli.load_dataset(path) == expected


@pytest.mark.asyncio
async def test_run_import_uses_async_session_and_existing_services(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "stations.json"
    _write_dataset(
        path,
        [
            _record(),
            _record(name="Invalid state", state="Atlantis", source_id="node/456"),
        ],
    )

    class FakeSession:
        rolled_back = False

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def rollback(self) -> None:
            self.rolled_back = True

    session = FakeSession()
    session_factory_calls = 0

    def fake_session_factory() -> FakeSession:
        nonlocal session_factory_calls
        session_factory_calls += 1
        return session

    async def fake_import(received_session, records):
        assert received_session is session
        assert len(records) == 1
        # The CLI must pass provenance/verification through unchanged.
        record = records[0]
        assert record.source == "OSM-Overpass"
        assert record.source_id == "node/123"
        assert record.data_source == StationDataSource.IMPORTED
        assert record.verification_status == StationVerificationStatus.UNVERIFIED
        return ImportSummary(imported=1)

    monkeypatch.setattr(cli, "AsyncSessionLocal", fake_session_factory)
    monkeypatch.setattr(cli, "import_stations", fake_import)

    summary = await cli.run_import(path)

    assert session_factory_calls == 1
    assert summary.total_records == 2
    assert summary.valid_records == 1
    assert summary.validation_error_count == 1
    assert summary.imported == 1
    assert summary.updated == 0
    assert summary.skipped == 0
    assert session.rolled_back is False


@pytest.mark.asyncio
async def test_second_run_reports_service_update_without_duplicate_logic(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "stations.json"
    _write_dataset(path, [_record()])

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def rollback(self) -> None:
            raise AssertionError("successful runs must not roll back")

    results = iter([ImportSummary(imported=1), ImportSummary(updated=1)])

    async def fake_import(session, records):
        assert len(records) == 1
        return next(results)

    monkeypatch.setattr(cli, "AsyncSessionLocal", FakeSession)
    monkeypatch.setattr(cli, "import_stations", fake_import)

    first = await cli.run_import(path)
    second = await cli.run_import(path)

    assert (first.imported, first.updated) == (1, 0)
    assert (second.imported, second.updated) == (0, 1)


@pytest.mark.asyncio
async def test_database_failure_rolls_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "stations.json"
    _write_dataset(path, [_record()])

    class FakeSession:
        rolled_back = False

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def rollback(self) -> None:
            self.rolled_back = True

    session = FakeSession()

    async def fail_import(received_session, records):
        raise RuntimeError("database write failed")

    monkeypatch.setattr(cli, "AsyncSessionLocal", lambda: session)
    monkeypatch.setattr(cli, "import_stations", fail_import)

    with pytest.raises(RuntimeError, match="database write failed"):
        await cli.run_import(path)
    assert session.rolled_back is True


@pytest.mark.parametrize(
    "payload,message",
    [
        ([], "JSON object"),
        ({"meta": {}}, "'records' array"),
        ({"records": {}}, "'records' array"),
    ],
)
def test_load_dataset_rejects_wrong_shape(
    tmp_path: Path, payload: object, message: str
) -> None:
    path = tmp_path / "stations.json"
    path.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(cli.DatasetLoadError, match=message):
        cli.load_dataset(path)


def test_print_summary_includes_all_required_counts(capsys) -> None:
    cli.print_summary(
        cli.CliImportSummary(
            total_records=892,
            valid_records=890,
            validation_errors=[
                {"index": 3, "errors": ["state is invalid"]},
                {"index": 8, "errors": ["source is required"]},
            ],
            imported=800,
            updated=70,
            skipped=20,
        )
    )

    output = capsys.readouterr().out
    for label, value in (
        ("Total records", 892),
        ("Valid records", 890),
        ("Validation errors", 2),
        ("Imported", 800),
        ("Updated", 70),
        ("Skipped", 20),
    ):
        assert label in output
        assert str(value) in output


def test_main_does_not_print_sensitive_database_exception(
    monkeypatch: pytest.MonkeyPatch, capsys
) -> None:
    secret = "postgresql+asyncpg://admin:do-not-print@db.example.test/catalogue"

    async def fail_import():
        raise RuntimeError(secret)

    class FakeEngine:
        async def dispose(self) -> None:
            pass

    monkeypatch.setattr(cli, "run_import", fail_import)
    monkeypatch.setattr(cli, "async_engine", FakeEngine())

    assert cli.main([]) == 1
    captured = capsys.readouterr()
    assert secret not in captured.out
    assert secret not in captured.err
    assert "RuntimeError" in captured.err
    assert "Connection details were not printed" in captured.err
