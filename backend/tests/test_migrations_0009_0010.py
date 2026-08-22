"""
Tests for migrations 0009 (station provenance) and 0010 (report review
workflow).

Generates the offline migration SQL (``alembic upgrade head --sql``) and
asserts the new columns/constraints are created, existing tables are only
altered (never dropped — the 176 seeded stations survive), and the chain has
a single head.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _alembic() -> str:
    exe = shutil_which()
    if exe:
        return exe
    candidate = Path(sys.executable).parent / "alembic"
    if candidate.exists():
        return str(candidate)
    pytest.skip("alembic CLI not available")


def shutil_which() -> str | None:
    import shutil

    return shutil.which("alembic")


@pytest.fixture(scope="module")
def upgrade_sql() -> str:
    result = subprocess.run(
        [_alembic(), "upgrade", "head", "--sql"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


@pytest.fixture(scope="module")
def downgrade_sql() -> str:
    """Downgrade ONLY migrations 0010 and 0009 (head → 0008), which is the
    reversible slice this test file is responsible for."""
    result = subprocess.run(
        [_alembic(), "downgrade", "0010:0008", "--sql"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def test_single_migration_head() -> None:
    result = subprocess.run(
        [_alembic(), "heads"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    heads = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    assert len(heads) == 1, f"expected a single migration head, got {heads}"
    assert heads[0].startswith("0010")


# --------------------------------------------------------------------------- #
# 0009 — station provenance
# --------------------------------------------------------------------------- #
def test_migration_adds_provenance_columns(upgrade_sql: str) -> None:
    assert "data_source" in upgrade_sql
    assert "verification_status" in upgrade_sql
    assert "verified_at" in upgrade_sql
    assert "last_verified_at" in upgrade_sql
    assert "source_id" in upgrade_sql


def test_migration_backfills_existing_rows_as_seed_unverified(upgrade_sql: str) -> None:
    # server_defaults mean the existing 176 rows are backfilled as seed data
    # without any UPDATE statement touching or deleting station rows.
    assert "server_default='seed'" in upgrade_sql.replace('"', "'") or "DEFAULT 'seed'" in upgrade_sql
    assert "server_default='unverified'" in upgrade_sql.replace('"', "'") or "DEFAULT 'unverified'" in upgrade_sql


def test_migration_adds_provenance_check_constraints(upgrade_sql: str) -> None:
    assert "ck_fuel_stations_data_source" in upgrade_sql
    assert "ck_fuel_stations_verification_status" in upgrade_sql
    assert "'seed'" in upgrade_sql and "'official'" in upgrade_sql
    assert "'government'" in upgrade_sql and "'partner'" in upgrade_sql
    assert "'community'" in upgrade_sql and "'imported'" in upgrade_sql
    assert "'unverified'" in upgrade_sql and "'verified'" in upgrade_sql


def test_migration_adds_provenance_indexes(upgrade_sql: str) -> None:
    assert "ix_fuel_stations_data_source" in upgrade_sql
    assert "ix_fuel_stations_verification_status" in upgrade_sql


def test_migration_never_drops_station_tables(upgrade_sql: str) -> None:
    """The migration only adds columns — the stations table (and its rows)
    must survive untouched."""
    assert "DROP TABLE fuel_stations" not in upgrade_sql
    assert "DELETE FROM fuel_stations" not in upgrade_sql


# --------------------------------------------------------------------------- #
# 0010 — report review workflow
# --------------------------------------------------------------------------- #
def test_migration_widens_report_status_check(upgrade_sql: str) -> None:
    assert "under_review" in upgrade_sql
    assert "pending" in upgrade_sql
    assert "rejected" in upgrade_sql


def test_migration_adds_review_columns(upgrade_sql: str) -> None:
    assert "reviewed_by" in upgrade_sql
    assert "reviewed_at" in upgrade_sql
    assert "rejection_reason" in upgrade_sql
    assert "reviewer_notes" in upgrade_sql


def test_migration_adds_reviewer_fk(upgrade_sql: str) -> None:
    assert "fk_fuel_reports_reviewed_by_users" in upgrade_sql
    assert "REFERENCES users (id)" in upgrade_sql


def test_migration_never_drops_report_tables(upgrade_sql: str) -> None:
    assert "DROP TABLE fuel_reports" not in upgrade_sql
    assert "DELETE FROM fuel_reports" not in upgrade_sql


# --------------------------------------------------------------------------- #
# Downgrade safety
# --------------------------------------------------------------------------- #
def test_downgrade_drops_only_new_columns(downgrade_sql: str) -> None:
    """The 0009/0010 downgrades remove the new columns and restore the old
    status CHECK; no data-destroying statements are issued by them (the full
    chain's 0001 downgrade is what ultimately drops tables, and only after
    the new columns are gone)."""
    assert "DROP COLUMN data_source" in downgrade_sql
    assert "DROP COLUMN verification_status" in downgrade_sql
    assert "DROP COLUMN source_id" in downgrade_sql
    assert "DROP COLUMN reviewed_by" in downgrade_sql
    assert "DROP COLUMN rejection_reason" in downgrade_sql
    assert "DROP COLUMN reviewer_notes" in downgrade_sql
    assert "DELETE FROM fuel_stations" not in downgrade_sql
    assert "DELETE FROM fuel_reports" not in downgrade_sql
