"""
Shared pytest fixtures for the Phase 3 authentication tests.

The auth flow is exercised end-to-end against a real (in-memory SQLite) database
and real JWT crypto — no mocks. Because the ``User`` table has no PostGIS
dependency, it can be created on SQLite, while ``get_db`` is overridden to point
at the test session.
"""

from __future__ import annotations

from typing import Any, Callable

import httpx
import pytest
from fastapi import Depends, FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user, require_roles
from app.core import config
from app.core.database import get_db
from app.main import app as production_app
from app.models import User, UserRole
from tests._tokens import TEST_JWT_SECRET, mint_token


def bearer(token: str) -> dict[str, str]:
    """Build an Authorization header for a token."""
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Configuration: deterministic JWT settings for every test.
# --------------------------------------------------------------------------- #
@pytest.fixture(autouse=True)
def _configure_jwt(monkeypatch: pytest.MonkeyPatch):
    """Pin JWT settings so the suite never depends on real Supabase."""
    monkeypatch.setattr(config.settings, "SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    monkeypatch.setattr(config.settings, "SUPABASE_JWT_ALGORITHM", "HS256")
    monkeypatch.setattr(config.settings, "SUPABASE_JWT_AUDIENCE", "")
    yield


@pytest.fixture
def make_token() -> Callable[..., str]:
    """Factory that mints valid Supabase-style access tokens."""
    return mint_token


# --------------------------------------------------------------------------- #
# Async SQLite database + HTTP clients.
# --------------------------------------------------------------------------- #
@pytest.fixture
async def session_factory():
    """An async session factory bound to an in-memory SQLite database with only
    the ``users`` table created."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: User.__table__.create(sync_conn, checkfirst=True)
        )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.fixture
async def client(session_factory):
    """An async HTTP client against the real production app, with ``get_db``
    overridden to use the in-memory test database."""
    async def _override_get_db():
        async with session_factory() as session:
            yield session

    production_app.dependency_overrides[get_db] = _override_get_db
    transport = httpx.ASGITransport(app=production_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    production_app.dependency_overrides.clear()


@pytest.fixture
async def rbac_client(session_factory):
    """An async HTTP client against a tiny throwaway app exposing role-gated
    routes, so RBAC can be validated without polluting the production API."""
    app = FastAPI()

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    @app.get("/whoami")
    async def whoami(user: User = Depends(get_current_user)) -> dict[str, Any]:
        return {"id": str(user.id), "role": user.role.value}

    @app.get("/admin")
    async def admin_only(
        user: User = Depends(require_roles(UserRole.ADMIN)),
    ) -> dict[str, Any]:
        return {"ok": True}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
