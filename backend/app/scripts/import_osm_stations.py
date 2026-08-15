#!/usr/bin/env python3
"""Import the generated Nigeria OpenStreetMap station dataset.

This is a backend-side database command. It deliberately bypasses HTTP and
Supabase Auth: database access comes only from the application's configured
``AsyncSessionLocal`` connection. No database URL, key, password, or JWT is
accepted as a command-line argument or printed.

Run from the repository root with::

    cd backend && python -m app.scripts.import_osm_stations

The command reads only
``scripts/data/output/nigeria_osm_fuel_stations.json`` and delegates all
record validation and idempotent upsert behavior to the existing station
import service.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from app.core.database import AsyncSessionLocal, async_engine
from app.services.station_import import ImportSummary, import_stations, parse_records

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
DATASET_PATH = (
    REPOSITORY_ROOT
    / "scripts"
    / "data"
    / "output"
    / "nigeria_osm_fuel_stations.json"
)
DATASET_DISPLAY_PATH = "scripts/data/output/nigeria_osm_fuel_stations.json"


class DatasetLoadError(Exception):
    """A safe, user-facing error raised when the fixed dataset cannot load."""


@dataclass(frozen=True)
class CliImportSummary:
    """Complete CLI result, including validation and database counts."""

    total_records: int
    valid_records: int
    validation_errors: list[dict[str, Any]]
    imported: int
    updated: int
    skipped: int

    @property
    def validation_error_count(self) -> int:
        """Number of records rejected by validation."""
        return len(self.validation_errors)


def load_dataset(path: Path = DATASET_PATH) -> list[dict[str, Any]]:
    """Load records from the extractor's ``meta``/``records`` JSON envelope.

    Error messages intentionally contain no file contents or environment
    configuration. Non-dictionary entries are left for ``parse_records`` to
    reject per record, so malformed entries do not prevent valid entries in
    the same dataset from being imported.
    """
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError as exc:
        raise DatasetLoadError(
            f"Dataset not found at {DATASET_DISPLAY_PATH}."
        ) from exc
    except json.JSONDecodeError as exc:
        raise DatasetLoadError(
            "Dataset is not valid JSON "
            f"(line {exc.lineno}, column {exc.colno})."
        ) from exc
    except OSError as exc:
        raise DatasetLoadError(
            f"Dataset could not be read at {DATASET_DISPLAY_PATH}."
        ) from exc

    if not isinstance(payload, dict):
        raise DatasetLoadError(
            "Dataset must be a JSON object containing a 'records' array."
        )

    raw_records = payload.get("records")
    if not isinstance(raw_records, list):
        raise DatasetLoadError("Dataset must contain a 'records' array.")

    # Runtime validation remains the responsibility of parse_records(). The
    # cast only describes the existing service's input type to type checkers.
    return cast(list[dict[str, Any]], raw_records)


async def run_import(path: Path = DATASET_PATH) -> CliImportSummary:
    """Validate the fixed dataset and import every valid record.

    ``parse_records`` preserves each dataset record's source, source_id,
    data_source, and verification_status. ``import_stations`` supplies the
    existing source-id/name-city upsert semantics and transaction commit.
    """
    raw_records = load_dataset(path)
    records, validation_errors = parse_records(raw_records)

    database_summary = ImportSummary()
    if records:
        async with AsyncSessionLocal() as session:
            try:
                database_summary = await import_stations(session, records)
            except BaseException:
                # import_stations normally commits the whole batch. An
                # explicit rollback also leaves the session clean if a flush
                # or commit fails partway through.
                await session.rollback()
                raise

    return CliImportSummary(
        total_records=len(raw_records),
        valid_records=len(records),
        validation_errors=validation_errors,
        imported=database_summary.imported,
        updated=database_summary.updated,
        skipped=database_summary.skipped,
    )


def print_summary(summary: CliImportSummary) -> None:
    """Print the required non-sensitive import totals."""
    print("Station import summary")
    print("----------------------")
    print(f"Total records     : {summary.total_records}")
    print(f"Valid records     : {summary.valid_records}")
    print(f"Validation errors : {summary.validation_error_count}")
    print(f"Imported          : {summary.imported}")
    print(f"Updated           : {summary.updated}")
    print(f"Skipped           : {summary.skipped}")

    if summary.validation_errors:
        print("\nRejected record details:")
        for error in summary.validation_errors:
            index = error.get("index", "?")
            messages = error.get("errors", [])
            print(f"  - record index {index}: {'; '.join(str(item) for item in messages)}")


def build_arg_parser() -> argparse.ArgumentParser:
    """Build a no-secret, no-path-override command-line interface."""
    return argparse.ArgumentParser(
        prog="python -m app.scripts.import_osm_stations",
        description=(
            "Validate and directly import the generated Nigeria OSM fuel "
            "station dataset using the configured backend database."
        ),
    )


async def _run_and_dispose() -> CliImportSummary:
    """Run once and close pooled async database connections before exit."""
    try:
        return await run_import()
    finally:
        await async_engine.dispose()


def main(argv: list[str] | None = None) -> int:
    """CLI entry point with sanitized operational error reporting."""
    build_arg_parser().parse_args(argv)

    try:
        summary = asyncio.run(_run_and_dispose())
    except DatasetLoadError as exc:
        print(f"Import failed: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Import cancelled.", file=sys.stderr)
        return 130
    except Exception as exc:  # noqa: BLE001 - sanitize all DB/driver failures
        # Driver and SQLAlchemy exception strings may include hosts, usernames,
        # SQL parameters, or connection URLs. Print only the exception class.
        print(
            "Import failed during database validation or write "
            f"({type(exc).__name__}). Connection details were not printed.",
            file=sys.stderr,
        )
        return 1

    print_summary(summary)
    return 0 if summary.valid_records > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
