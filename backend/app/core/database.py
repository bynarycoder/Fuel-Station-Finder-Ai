from typing import Any, AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


# Modern SQLAlchemy 2.0 Declarative Base class
class Base(DeclarativeBase):
    pass


def build_async_connect_args(database_url: str) -> dict[str, Any]:
    """Build asyncpg ``connect_args`` for the async SQLAlchemy engine.

    Two production concerns are handled here:

    1. Pooled connections — the Supabase pooler hostnames
       (``aws-0-<region>.pooler.supabase.com``) serve IPv4 records only, so
       asyncpg's default name resolution already connects over IPv4 and no
       resolver override is needed. The Session Pooler (port 5432) presents a
       full PostgreSQL session and works with asyncpg as-is;
       ``statement_cache_size=0`` is kept for the Transaction Pooler
       (port 6543), whose transaction-level pooling cannot support asyncpg's
       server-side prepared-statement cache (prepared statements are
       per-connection and do not survive connection rotation). Disabling the
       cache is harmless on session and direct connections.
    2. SSL — Supabase requires TLS, so when the URL points at Supabase we
       pass ``ssl="require"`` (preserved from the original configuration).

    The kwargs are only applied to asyncpg URLs; the SQLite test driver does
    not accept them.
    """
    if not database_url.startswith("postgresql+asyncpg://"):
        return {}

    connect_args: dict[str, Any] = {
        # Disable asyncpg prepared-statement caching for compatibility with
        # the Supabase Transaction Pooler (port 6543); harmless otherwise.
        "statement_cache_size": 0,
    }

    if "supabase" in database_url or "ssl=require" in database_url:
        connect_args["ssl"] = "require"

    return connect_args


def build_sync_connect_args(database_url: str) -> dict[str, Any]:
    """Build psycopg2 ``connect_args`` for the sync engine and Alembic.

    Supabase requires TLS. The async engine already forces ``ssl=require``
    for Supabase URLs; the sync path (migrations, seed) must do the same or
    ``alembic upgrade head`` on Render silently fails to connect and the
    container never applies 0009/0010.

    If the URL already specifies ``sslmode=``, we leave it alone so an
    operator can override. Non-Postgres URLs (SQLite tests) get no extra args.
    """
    if not database_url.startswith("postgresql"):
        return {}
    if "sslmode=" in database_url:
        return {}
    if "supabase" in database_url:
        return {"sslmode": "require"}
    return {}


# Create database engines
# sync engine (used for migrations and seeding)
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
    connect_args=build_sync_connect_args(settings.DATABASE_URL),
)

# async engine (used for fast, asynchronous API endpoints)
async_engine = create_async_engine(
    settings.ASYNC_DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
    connect_args=build_async_connect_args(settings.ASYNC_DATABASE_URL),
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
