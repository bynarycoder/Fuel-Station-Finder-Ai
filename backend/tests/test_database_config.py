"""
Tests for the async database engine configuration.

These guard the production requirement that the asyncpg engine disables its
prepared-statement cache (``statement_cache_size=0``) so it works through the
Supabase Session Pooler (PgBouncer transaction pooling), while preserving the
SSL configuration for Supabase connections.
"""

from __future__ import annotations

from app.core.database import build_async_connect_args


def test_asyncpg_pooler_url_disables_prepared_statement_cache():
    args = build_async_connect_args(
        "postgresql+asyncpg://postgres.ref:pw@aws-0-region.pooler.supabase.com:6543/postgres"
    )
    assert args["statement_cache_size"] == 0


def test_asyncpg_supabase_url_enables_ssl():
    args = build_async_connect_args(
        "postgresql+asyncpg://postgres:pw@db.ref.supabase.co:5432/postgres"
    )
    assert args["statement_cache_size"] == 0
    assert args["ssl"] == "require"


def test_local_asyncpg_url_has_no_ssl_but_still_disables_cache():
    # The statement cache must be disabled for any asyncpg URL (pooler or not)
    # so the configuration is uniform; SSL is only added for Supabase.
    args = build_async_connect_args(
        "postgresql+asyncpg://postgres:postgres@localhost:5432/fuel_station_db"
    )
    assert args["statement_cache_size"] == 0
    assert "ssl" not in args


def test_non_asyncpg_driver_receives_no_asyncpg_kwargs():
    # The SQLite test driver must not receive asyncpg-specific connect args.
    args = build_async_connect_args("sqlite+aiosqlite:///:memory:")
    assert "statement_cache_size" not in args
    assert "ssl" not in args


def test_explicit_ssl_require_flag_is_honored():
    args = build_async_connect_args(
        "postgresql+asyncpg://user:pw@db.example.com:5432/app?ssl=require"
    )
    assert args["statement_cache_size"] == 0
    assert args["ssl"] == "require"
