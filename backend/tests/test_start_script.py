"""
Guard the production entrypoint: migrations must run before uvicorn.

The 2026-08-13 station-load 500 was caused by Render auto-deploying ORM
code that SELECTs fuel_stations.data_source / verification_status (and
fuel_reports.reviewed_*) while the Dockerfile only started uvicorn — so
Alembic revisions 0009/0010 never reached production Supabase.

These tests lock the contract: the image boots via start.sh, start.sh
runs `alembic upgrade head` then uvicorn, and it never seeds, resets, or
deletes station rows.
"""

from __future__ import annotations

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
START_SH = BACKEND_DIR / "start.sh"
DOCKERFILE = BACKEND_DIR / "Dockerfile"


def test_start_script_exists_and_is_nonempty() -> None:
    assert START_SH.is_file()
    assert START_SH.stat().st_size > 0


def test_start_script_applies_alembic_then_starts_uvicorn() -> None:
    text = START_SH.read_text(encoding="utf-8")
    assert "alembic upgrade head" in text
    assert "uvicorn app.main:app" in text
    # upgrade must appear before uvicorn so a missing column cannot be served.
    assert text.index("alembic upgrade head") < text.index("uvicorn app.main:app")


def test_start_script_never_seeds_or_resets() -> None:
    text = START_SH.read_text(encoding="utf-8")
    assert "app.scripts.seed" not in text
    assert "alembic downgrade" not in text
    assert "DROP TABLE" not in text
    assert "--reset" not in text


def test_dockerfile_uses_start_script() -> None:
    text = DOCKERFILE.read_text(encoding="utf-8")
    assert "start.sh" in text
    assert 'CMD ["/app/start.sh"]' in text
    # The previous regression: uvicorn as the sole CMD, no migrate step.
    assert 'CMD sh -c "uvicorn' not in text


def test_alembic_env_uses_supabase_safe_sync_engine() -> None:
    """Online migrations must use create_engine + build_sync_connect_args
    so Render can reach Supabase over TLS (psycopg2, not asyncpg)."""
    env = (BACKEND_DIR / "alembic" / "env.py").read_text(encoding="utf-8")
    assert "create_engine" in env
    assert "build_sync_connect_args" in env
    assert "engine_from_config" not in env
