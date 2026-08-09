"""
API-level tests for user favorites (Phase: Favorites).

Covers authentication, ownership isolation, idempotent add/remove, and the
station-not-found path. The test database enables SQLite foreign-key
enforcement so FK behaviour matches Postgres.
"""

from __future__ import annotations

import uuid
from typing import Any, AsyncIterator

import httpx
import pytest
import sqlalchemy as sa
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.core.database import get_db
from app.main import app as production_app
from app.models import Favorite, User, UserRole

STATION_A = uuid.uuid4()
STATION_B = uuid.uuid4()


@pytest.fixture
async def favorites_client():
    """Client wired to a SQLite DB with users + fuel_stations + favorites
    tables and FK enforcement on (so unknown stations behave like Postgres)."""

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _fk_on(dbapi_conn, _record):  # pragma: no cover - driver hook
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: User.__table__.create(sync_conn, checkfirst=True)
        )
        # Minimal parent table so SQLite FK enforcement has a real target; the
        # full model uses a PostGIS geography column unavailable on SQLite.
        await conn.execute(
            sa.text(
                "CREATE TABLE IF NOT EXISTS fuel_stations "
                "(id UUID PRIMARY KEY, name VARCHAR(200) NOT NULL)"
            )
        )
        await conn.run_sync(
            lambda sync_conn: Favorite.__table__.create(sync_conn, checkfirst=True)
        )
        # Two "real" stations the favorites can reference. SQLAlchemy's Uuid
        # type stores CHAR(32) hex (no dashes), so insert the same form.
        await conn.execute(
            sa.text(
                "INSERT OR IGNORE INTO fuel_stations (id, name) "
                "VALUES (:a, 'Station A'), (:b, 'Station B')"
            ),
            {"a": STATION_A.hex, "b": STATION_B.hex},
        )

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def _override_get_db() -> AsyncIterator[Any]:
        async with factory() as session:
            yield session

    production_app.dependency_overrides[get_db] = _override_get_db
    transport = httpx.ASGITransport(app=production_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, factory
    production_app.dependency_overrides.clear()
    await engine.dispose()


async def _authenticate(
    factory: async_sessionmaker[AsyncSession], email: str
) -> httpx.AsyncClient:
    """Insert a real user row (FK target) and authenticate the app as them."""
    user = User(id=uuid.uuid4(), email=email, role=UserRole.DRIVER, is_active=True)
    async with factory() as session:
        session.add(user)
        await session.commit()

    production_app.dependency_overrides[get_current_user] = lambda: user
    return production_app


async def test_favorites_require_authentication(favorites_client) -> None:
    client = favorites_client[0]
    response = await client.get("/api/v1/favorites")
    assert response.status_code == 401

    response = await client.put(f"/api/v1/favorites/{STATION_A}")
    assert response.status_code == 401

    response = await client.delete(f"/api/v1/favorites/{STATION_A}")
    assert response.status_code == 401


async def test_add_list_remove_roundtrip(favorites_client) -> None:
    client, factory = favorites_client
    await _authenticate(factory, "driver@example.com")

    # Add.
    response = await client.put(f"/api/v1/favorites/{STATION_A}")
    assert response.status_code == 200
    body = response.json()
    assert body["station_id"] == str(STATION_A)

    # List shows exactly one favorite.
    response = await client.get("/api/v1/favorites")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["station_id"] == str(STATION_A)

    # Duplicate add is idempotent — still one favorite.
    response = await client.put(f"/api/v1/favorites/{STATION_A}")
    assert response.status_code == 200
    response = await client.get("/api/v1/favorites")
    assert response.json()["total"] == 1

    # Add a second station.
    response = await client.put(f"/api/v1/favorites/{STATION_B}")
    assert response.status_code == 200
    response = await client.get("/api/v1/favorites")
    assert response.json()["total"] == 2

    # Remove.
    response = await client.delete(f"/api/v1/favorites/{STATION_A}")
    assert response.status_code == 204
    response = await client.get("/api/v1/favorites")
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["station_id"] == str(STATION_B)

    # Removing again is a safe no-op.
    response = await client.delete(f"/api/v1/favorites/{STATION_A}")
    assert response.status_code == 204


async def test_favorites_are_isolated_per_user(favorites_client) -> None:
    client, factory = favorites_client
    await _authenticate(factory, "alice@example.com")
    response = await client.put(f"/api/v1/favorites/{STATION_A}")
    assert response.status_code == 200

    # Switch to Bob — his list is empty.
    await _authenticate(factory, "bob@example.com")
    response = await client.get("/api/v1/favorites")
    assert response.status_code == 200
    assert response.json()["total"] == 0  # Bob never sees Alice's favorites


async def test_favorite_unknown_station_is_404(favorites_client) -> None:
    client, factory = favorites_client
    await _authenticate(factory, "carol@example.com")
    response = await client.put(f"/api/v1/favorites/{uuid.uuid4()}")
    assert response.status_code == 404
