"""
Shared pytest fixtures for the Phase 3 authentication tests.

The auth flow is exercised end-to-end against a real (in-memory SQLite) database
and real ES256 JWT crypto — no authentication bypasses. Because the ``User``
table has no PostGIS dependency, it can be created on SQLite, while ``get_db``
is overridden to point at the test session.
"""

from __future__ import annotations

import uuid
from typing import Any, Callable

import httpx
import pytest
from fastapi import Depends, FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user, require_roles
from app.core import config, security
from app.core.database import get_db
from app.main import app as production_app
from app.models import User, UserRole
from tests._tokens import TEST_JWK, TEST_JWKS_URL, TEST_SUPABASE_ISSUER, mint_token


def bearer(token: str) -> dict[str, str]:
    """Build an Authorization header for a token."""
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Configuration: deterministic JWT settings for every test.
# --------------------------------------------------------------------------- #
@pytest.fixture(autouse=True)
def _configure_jwt(monkeypatch: pytest.MonkeyPatch):
    """Pin JWT settings and JWKS so the suite never depends on real Supabase."""
    monkeypatch.setattr(config.settings, "SUPABASE_JWT_ALGORITHM", "ES256")
    monkeypatch.setattr(config.settings, "SUPABASE_JWT_AUDIENCE", "authenticated")
    monkeypatch.setattr(config.settings, "SUPABASE_JWT_ISSUER", TEST_SUPABASE_ISSUER)
    monkeypatch.setattr(config.settings, "SUPABASE_JWKS_URL", TEST_JWKS_URL)
    monkeypatch.setattr(
        security,
        "_fetch_jwks",
        lambda _url: {"keys": [TEST_JWK]},
    )
    security.clear_jwks_cache()
    yield
    security.clear_jwks_cache()


@pytest.fixture
def make_token() -> Callable[..., str]:
    """Factory that mints valid Supabase-style access tokens."""
    return mint_token


@pytest.fixture
def authenticated_as(client) -> Callable[..., Any]:
    """Override ``get_current_user`` to inject an in-memory user with a given
    role, so role-based access control can be exercised without a database.

    Returns a callable that takes a ``UserRole`` (+ optional email/id) and
    yields the same test HTTP client authenticated as that user.
    """

    def _setup(
        role: UserRole,
        email: str = "staff@example.com",
        user_id: uuid.UUID | None = None,
    ) -> Any:
        user = User(
            id=user_id or uuid.uuid4(),
            email=email,
            role=role,
            is_active=True,
        )
        production_app.dependency_overrides[get_current_user] = lambda: user
        return client

    return _setup


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


# --------------------------------------------------------------------------- #
# Portable (geography-free) schema fixtures for station/report service tests.
#
# The production ``fuel_stations.location`` column is a PostGIS
# ``geography(POINT, 4326)`` type, which plain SQLite cannot create or bind.
# These fixtures build the same tables with a portable ``Text`` schema and
# swap the ORM column's type + the import service's geometry helper so the
# real service code (seed, import, review workflow) runs end-to-end on SQLite.
# The swap is restored automatically after each test.
# --------------------------------------------------------------------------- #
@pytest.fixture
def portable_sync_session(monkeypatch):
    """A synchronous session factory over an in-memory SQLite DB with the
    portable station/report schema (location as plain text)."""
    from sqlalchemy import create_engine, Text
    from sqlalchemy.orm import sessionmaker

    from app.models import FuelStation
    from tests._portable_db import build_portable_metadata, portable_location_wkt

    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    build_portable_metadata().create_all(engine)

    loc_col = FuelStation.__table__.c.location
    monkeypatch.setattr(loc_col, "type", Text())

    from app.services import station_import as si
    monkeypatch.setattr(si, "geography_point", portable_location_wkt)

    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    try:
        yield factory
    finally:
        engine.dispose()


@pytest.fixture
async def portable_client(monkeypatch):
    """An async HTTP client over the portable schema (get_db overridden).

    Combine with ``authenticated_as`` (declare it FIRST in the test signature
    so its ``client`` dependency does not overwrite this fixture's ``get_db``
    override afterwards).
    """
    from sqlalchemy import Text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.models import FuelStation
    from tests._portable_db import build_portable_metadata, portable_location_wkt

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: build_portable_metadata().create_all(sync_conn))

    loc_col = FuelStation.__table__.c.location
    monkeypatch.setattr(loc_col, "type", Text())

    from app.services import station_import as si
    monkeypatch.setattr(si, "geography_point", portable_location_wkt)

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def _override_get_db():
        async with factory() as session:
            yield session

    production_app.dependency_overrides[get_db] = _override_get_db
    transport = httpx.ASGITransport(app=production_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # Expose the same session factory so tests can inspect rows written
        # through the API (same in-memory DB, same engine pool).
        ac._portable_factory = factory  # type: ignore[attr-defined]
        try:
            yield ac
        finally:
            production_app.dependency_overrides.pop(get_db, None)
            await engine.dispose()


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
