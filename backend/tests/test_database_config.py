"""
Tests for the async database engine configuration.

These guard the production requirements that asyncpg uses IPv4 on Render,
disables its prepared-statement cache for the Supabase Session Pooler, and
requires SSL for Supabase connections without leaking asyncpg-only arguments
to SQLite.
"""

from __future__ import annotations

import socket
from unittest.mock import AsyncMock

import asyncpg

from app.core import database
from app.core.database import build_async_connect_args


def test_asyncpg_pooler_url_uses_ipv4_and_disables_statement_cache():
    args = build_async_connect_args(
        "postgresql+asyncpg://postgres.ref:pw@aws-0-region.pooler.supabase.com:6543/postgres"
    )
    assert args["statement_cache_size"] == 0
    assert args["family"] == socket.AF_INET


def test_asyncpg_supabase_url_enables_ssl():
    args = build_async_connect_args(
        "postgresql+asyncpg://postgres:pw@db.ref.supabase.co:5432/postgres"
    )
    assert args["statement_cache_size"] == 0
    assert args["family"] == socket.AF_INET
    assert args["ssl"] == "require"


def test_local_asyncpg_url_uses_ipv4_without_ssl():
    args = build_async_connect_args(
        "postgresql+asyncpg://postgres:postgres@localhost:5432/fuel_station_db"
    )
    assert args["statement_cache_size"] == 0
    assert args["family"] == socket.AF_INET
    assert "ssl" not in args


def test_sqlite_receives_no_asyncpg_connect_args():
    args = build_async_connect_args("sqlite+aiosqlite:///supabase.db")
    assert args == {}


def test_explicit_ssl_require_flag_is_honored():
    args = build_async_connect_args(
        "postgresql+asyncpg://user:pw@db.example.com:5432/app?ssl=require"
    )
    assert args["statement_cache_size"] == 0
    assert args["family"] == socket.AF_INET
    assert args["ssl"] == "require"


async def test_asyncpg_host_resolution_is_restricted_to_ipv4(monkeypatch):
    loop = AsyncMock()
    loop.getaddrinfo.return_value = [
        (
            socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
            "",
            ("192.0.2.10", 5432),
        )
    ]
    monkeypatch.setattr(database.asyncio, "get_running_loop", lambda: loop)

    resolved = await database._resolve_asyncpg_host(
        "db.ref.supabase.co",
        5432,
        socket.AF_INET,
    )

    assert resolved == "192.0.2.10"
    loop.getaddrinfo.assert_awaited_once_with(
        "db.ref.supabase.co",
        5432,
        family=socket.AF_INET,
        type=socket.SOCK_STREAM,
        proto=socket.IPPROTO_TCP,
    )


async def test_asyncpg_creator_resolves_ipv4_when_driver_lacks_family(
    monkeypatch,
):
    """The fallback consumes ``family`` instead of passing it to asyncpg."""
    connection = object()
    resolve_host = AsyncMock(return_value="192.0.2.10")
    connect = AsyncMock(return_value=connection)
    monkeypatch.setattr(database, "_resolve_asyncpg_host", resolve_host)
    monkeypatch.setattr(asyncpg, "connect", connect)

    database_url = (
        "postgresql+asyncpg://postgres:pw@db.ref.supabase.co:5432/postgres"
    )
    creator = database._build_asyncpg_creator(
        database_url,
        build_async_connect_args(database_url),
    )

    assert await creator() is connection
    resolve_host.assert_awaited_once_with(
        "db.ref.supabase.co",
        5432,
        socket.AF_INET,
    )
    connect.assert_awaited_once_with(
        host="192.0.2.10",
        database="postgres",
        user="postgres",
        password="pw",
        port=5432,
        statement_cache_size=0,
        ssl="require",
    )
