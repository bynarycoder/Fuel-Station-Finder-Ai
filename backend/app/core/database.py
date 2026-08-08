import asyncio
import inspect
import socket
from collections.abc import Awaitable, Callable
from typing import Any, AsyncGenerator

import asyncpg
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


# Modern SQLAlchemy 2.0 Declarative Base class
class Base(DeclarativeBase):
    pass


def build_async_connect_args(database_url: str) -> dict[str, Any]:
    """Build asyncpg ``connect_args`` for the async SQLAlchemy engine.

    Three production concerns are handled here:

    1. IPv4 — Render cannot reach Supabase over IPv6, so asyncpg connections
       are restricted to ``AF_INET`` instead of using unrestricted DNS
       resolution.
    2. SSL — Supabase requires TLS, so when the URL points at Supabase we pass
       ``ssl="require"`` (preserved from the original configuration).
    3. PgBouncer / Supabase Session Pooler compatibility — the pooler uses
       transaction-level pooling, which cannot support asyncpg's server-side
       prepared-statement cache (prepared statements are per-connection and do
       not survive connection rotation). We therefore disable the cache with
       ``statement_cache_size=0`` for every asyncpg URL. This is harmless on a
       direct (non-pooled) connection and is the documented requirement for
       PgBouncer transaction pooling.

    The kwargs are only applied to asyncpg URLs; the SQLite test driver does
    not accept them.
    """
    if not database_url.startswith("postgresql+asyncpg://"):
        return {}

    connect_args: dict[str, Any] = {
        # Disable asyncpg prepared-statement caching for PgBouncer/Supabase
        # Session Pooler (port 6543) transaction pooling compatibility.
        "statement_cache_size": 0,
        # Restrict DNS/socket resolution to IPv4 for Render connectivity.
        "family": socket.AF_INET,
    }

    if "supabase" in database_url or "ssl=require" in database_url:
        connect_args["ssl"] = "require"

    return connect_args


def _asyncpg_supports_family() -> bool:
    """Return whether this asyncpg release accepts a ``family`` kwarg."""
    return "family" in inspect.signature(asyncpg.connect).parameters


async def _resolve_asyncpg_host(
    host: str | list[str] | tuple[str, ...],
    port: int | list[int] | tuple[int, ...] | None,
    family: socket.AddressFamily,
) -> str | list[str] | tuple[str, ...]:
    """Resolve asyncpg TCP hosts within one explicit address family.

    asyncpg 0.29 through 0.31 do not expose asyncio's ``family`` connection
    argument. Resolve the hostname before handing it to asyncpg so its internal
    ``loop.create_connection`` receives IPv4 literals and cannot select AAAA
    records. Resolution remains asynchronous and is repeated when the pool
    opens a new connection, so DNS changes are not fixed at application start.
    """
    if family != socket.AF_INET:
        return host

    hosts = list(host) if isinstance(host, (list, tuple)) else [host]
    ports = list(port) if isinstance(port, (list, tuple)) else [port] * len(hosts)
    loop = asyncio.get_running_loop()
    resolved_hosts: list[str] = []

    for current_host, current_port in zip(hosts, ports):
        # A path denotes a Unix-domain socket and requires no IP resolution.
        if current_host.startswith("/"):
            resolved_hosts.append(current_host)
            continue

        address_info = await loop.getaddrinfo(
            current_host,
            current_port or 5432,
            family=family,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
        for result in address_info:
            ipv4_address = result[4][0]
            if ipv4_address not in resolved_hosts:
                resolved_hosts.append(ipv4_address)

    if len(resolved_hosts) == 1:
        return resolved_hosts[0]
    return resolved_hosts


def _build_asyncpg_creator(
    database_url: str,
    connect_args: dict[str, Any],
) -> Callable[[], Awaitable[asyncpg.Connection]]:
    """Create an asyncpg connector that consumes the IPv4 family setting.

    SQLAlchemy forwards ``connect_args`` directly to asyncpg, but the installed
    asyncpg API has no ``family`` parameter. This creator applies SQLAlchemy's
    normal URL-to-driver conversion, resolves the configured host using IPv4,
    and then calls asyncpg without the unsupported keyword.
    """
    url = make_url(database_url)
    dialect = url.get_dialect()()
    _, url_connect_args = dialect.create_connect_args(url)

    async def create_connection() -> asyncpg.Connection:
        driver_args = {**url_connect_args, **connect_args}
        family = driver_args.pop("family")
        driver_args["host"] = await _resolve_asyncpg_host(
            driver_args["host"],
            driver_args.get("port"),
            family,
        )
        return await asyncpg.connect(**driver_args)

    return create_connection


# Create database engines
# sync engine (used for migrations and seeding)
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
)

# async engine (used for fast, asynchronous API endpoints)
_async_connect_args = build_async_connect_args(settings.ASYNC_DATABASE_URL)
_async_engine_options: dict[str, Any] = {
    "pool_pre_ping": True,
    "echo": False,
}

if "family" in _async_connect_args and not _asyncpg_supports_family():
    # asyncpg 0.29-0.31 do not accept ``family`` directly. Consume it in an
    # async creator that resolves only AF_INET addresses instead.
    _async_engine_options["async_creator"] = _build_asyncpg_creator(
        settings.ASYNC_DATABASE_URL,
        _async_connect_args,
    )
else:
    _async_engine_options["connect_args"] = _async_connect_args

async_engine = create_async_engine(
    settings.ASYNC_DATABASE_URL,
    **_async_engine_options,
)

# Session factories
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

AsyncSessionLocal = async_sessionmaker(
    autoflush=False,
    expire_on_commit=False,
    bind=async_engine,
)


# Dependency to get db session in FastAPI routes
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
