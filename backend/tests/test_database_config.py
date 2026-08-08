"""
Tests for the async database engine configuration.

These guard the production requirements that asyncpg disables its
prepared-statement cache for Supabase pooler compatibility, and requires SSL
for Supabase connections without leaking asyncpg-only arguments to SQLite.

The Supabase pooler hostnames are IPv4-only in DNS, so no address-family
override is configured: asyncpg's default resolution connects over IPv4.
"""

from __future__ import annotations

from app.core.database import build_async_connect_args


def test_asyncpg_pooler_url_disables_statement_cache():
    args = build_async_connect_args(
        "postgresql+asyncpg://postgres.ref:pw@aws-0-region.pooler.supabase.com:6543/postgres"
    )
    assert args["statement_cache_size"] == 0
    assert "family" not in args


def test_asyncpg_supabase_url_enables_ssl():
    args = build_async_connect_args(
        "postgresql+asyncpg://postgres:pw@db.ref.supabase.co:5432/postgres"
    )
    assert args["statement_cache_size"] == 0
    assert args["ssl"] == "require"
    assert "family" not in args


def test_local_asyncpg_url_uses_no_ssl():
    args = build_async_connect_args(
        "postgresql+asyncpg://postgres:postgres@localhost:5432/fuel_station_db"
    )
    assert args["statement_cache_size"] == 0
    assert "ssl" not in args
    assert "family" not in args


def test_sqlite_receives_no_asyncpg_connect_args():
    args = build_async_connect_args("sqlite+aiosqlite:///supabase.db")
    assert args == {}


def test_explicit_ssl_require_flag_is_honored():
    args = build_async_connect_args(
        "postgresql+asyncpg://user:pw@db.example.com:5432/app?ssl=require"
    )
    assert args["statement_cache_size"] == 0
    assert args["ssl"] == "require"
    assert "family" not in args
