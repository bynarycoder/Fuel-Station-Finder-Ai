"""
Tests for the Alembic migration artifact.

We generate the migration SQL *offline* (`alembic upgrade head --sql`), which
requires no database connection, and assert the rendered DDL contains the
expected PostGIS extension, the geography column, the spatial GiST index and a
clean reversible downgrade. This is a real end-to-end check of the migration
file as it would run in production — no mocks.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

# `backend/` is the parent of the `tests/` directory.
BACKEND_DIR = Path(__file__).resolve().parent.parent


def _resolve_alembic() -> str | None:
    """Find the alembic CLI: prefer PATH, fall back to the current
    interpreter's bin directory (so the venv copy is used even when the venv is
    not activated).

    We deliberately do *not* resolve symlinks: ``.venv/bin/python`` is typically
    a symlink to the system interpreter, so resolving it would escape the venv
    and miss the venv-local ``alembic`` console script.
    """
    exe = shutil.which("alembic")
    if exe:
        return exe
    candidate = Path(sys.executable).parent / "alembic"
    return str(candidate) if candidate.exists() else None


ALEMBIC_EXE = _resolve_alembic()


@pytest.fixture(scope="module")
def upgrade_sql() -> str:
    if ALEMBIC_EXE is None:
        pytest.skip("alembic CLI not available on PATH")
    result = subprocess.run(
        [ALEMBIC_EXE, "upgrade", "head", "--sql"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


@pytest.fixture(scope="module")
def downgrade_sql() -> str:
    if ALEMBIC_EXE is None:
        pytest.skip("alembic CLI not available on PATH")
    result = subprocess.run(
        [ALEMBIC_EXE, "downgrade", "0001:base", "--sql"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def test_migration_enables_postgis_extension(upgrade_sql: str) -> None:
    assert "CREATE EXTENSION IF NOT EXISTS postgis" in upgrade_sql


def test_migration_creates_all_phase2_tables(upgrade_sql: str) -> None:
    assert "CREATE TABLE fuel_types" in upgrade_sql
    assert "CREATE TABLE fuel_stations" in upgrade_sql
    assert "CREATE TABLE fuel_station_fuel_types" in upgrade_sql


def test_migration_uses_geography_point_type(upgrade_sql: str) -> None:
    assert "geography(POINT,4326)" in upgrade_sql


def test_migration_creates_spatial_gist_index(upgrade_sql: str) -> None:
    assert "idx_fuel_stations_location" in upgrade_sql
    assert "USING gist" in upgrade_sql
    # The GiST index must be created exactly once (no duplicate statements).
    assert upgrade_sql.count("idx_fuel_stations_location") == 1


def test_migration_sets_up_foreign_keys_with_cascade(upgrade_sql: str) -> None:
    assert "ON DELETE CASCADE" in upgrade_sql
    assert "REFERENCES fuel_stations (id)" in upgrade_sql
    assert "REFERENCES fuel_types (code)" in upgrade_sql


def test_migration_check_constraint_locks_fuel_codes(upgrade_sql: str) -> None:
    assert "ck_fuel_types_code_domain" in upgrade_sql
    assert "PMS" in upgrade_sql and "LPG" in upgrade_sql


def test_downgrade_drops_all_tables(downgrade_sql: str) -> None:
    assert "DROP TABLE fuel_station_fuel_types" in downgrade_sql
    assert "DROP TABLE fuel_stations" in downgrade_sql
    assert "DROP TABLE fuel_types" in downgrade_sql


def test_initial_migration_revision_metadata() -> None:
    """The migration module must declare itself as the initial revision."""
    import importlib.util

    migration_path = BACKEND_DIR / "alembic" / "versions" / "0001_initial_schema.py"
    spec = importlib.util.spec_from_file_location("migration_0001", migration_path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)  # type: ignore[union-attr]

    assert migration.revision == "0001"
    assert migration.down_revision is None
    assert callable(migration.upgrade)
    assert callable(migration.downgrade)
