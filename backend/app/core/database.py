from typing import Any, AsyncGenerator
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

# Modern SQLAlchemy 2.0 Declarative Base class
class Base(DeclarativeBase):
    pass


def build_async_connect_args(database_url: str) -> dict[str, Any]:
    """Build asyncpg ``connect_args`` for the async SQLAlchemy engine.

    Two production concerns are handled here:

    1. SSL — Supabase requires TLS, so when the URL points at Supabase we pass
       ``ssl="require"`` (preserved from the original configuration).
    2. PgBouncer / Supabase Session Pooler compatibility — the pooler uses
       transaction-level pooling, which cannot support asyncpg's server-side
       prepared-statement cache (prepared statements are per-connection and do
       not survive connection rotation). We therefore disable the cache with
       ``statement_cache_size=0`` for every asyncpg URL. This is harmless on a
       direct (non-pooled) connection and is the documented requirement for
       PgBouncer transaction pooling.

    The kwargs are only applied to asyncpg URLs; the SQLite test driver does
    not accept them.
    """
    connect_args: dict[str, Any] = {}

    if database_url.startswith("postgresql+asyncpg://"):
        # Disable asyncpg prepared-statement caching for PgBouncer/Supabase
        # Session Pooler (port 6543) transaction pooling compatibility.
        connect_args["statement_cache_size"] = 0

    if "supabase" in database_url or "ssl=require" in database_url:
        connect_args["ssl"] = "require"

    return connect_args


# Create database engines
# sync engine (used for migrations and seeding)
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=False
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
    bind=engine
)

AsyncSessionLocal = async_sessionmaker(
    autoflush=False, 
    expire_on_commit=False, 
    bind=async_engine
)

# Dependency to get db session in FastAPI routes
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
