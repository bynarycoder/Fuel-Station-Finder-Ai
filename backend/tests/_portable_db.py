"""
Portable SQLite database helper for tests that need ``fuel_stations``.

The production ``fuel_stations`` table stores its location as a PostGIS
``geography(POINT, 4326)`` column; plain SQLite has no PostGIS, so (as the
existing seed tests do) we rebind the ORM model's ``__table__`` to a portable
table where ``location`` is a ``LargeBinary``. Combined with monkeypatching
the module-level geometry helper to return ``bytes``, the real service code
(seed, import, review workflow) can be exercised end-to-end on SQLite.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from typing import Any, Iterator

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    LargeBinary,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
    text,
)
from sqlalchemy.schema import UniqueConstraint


def build_portable_metadata() -> MetaData:
    """A MetaData with portable (geography-free) tables mirroring the ORM."""
    meta = MetaData()

    Table(
        "fuel_types",
        meta,
        Column("code", String(8), primary_key=True),
        Column("name", String(100), nullable=False),
        Column("description", Text),
        Column("is_active", Boolean, default=True, nullable=False),
        Column("created_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
        Column("updated_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
    )

    Table(
        "fuel_stations",
        meta,
        Column("id", String(36), primary_key=True),
        Column("name", String(200), nullable=False),
        Column("brand", String(100)),
        Column("address", String(255)),
        Column("city", String(100)),
        Column("state", String(100)),
        Column("phone", String(40)),
        Column("location", LargeBinary, nullable=False),
        Column("is_active", Boolean, default=True, nullable=False),
        Column("data_source", String(20), nullable=False, default="seed"),
        Column("verification_status", String(20), nullable=False, default="unverified"),
        Column("verified_at", DateTime),
        Column("last_verified_at", DateTime),
        Column("source_id", String(100)),
        Column("created_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
        Column("updated_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
        UniqueConstraint("name", "city", name="uq_fuel_stations_name_city"),
    )

    Table(
        "fuel_station_fuel_types",
        meta,
        Column("station_id", String(36), primary_key=True),
        Column("fuel_type_code", String(8), primary_key=True),
        Column("created_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
        Column("updated_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
    )

    Table(
        "users",
        meta,
        Column("id", String(36), primary_key=True),
        Column("email", String(255), nullable=False),
        Column("full_name", String(200)),
        Column("role", String(30), nullable=False, default="driver"),
        Column("is_active", Boolean, default=True, nullable=False),
        Column("created_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
        Column("updated_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
        UniqueConstraint("email", name="uq_users_email"),
    )

    Table(
        "fuel_reports",
        meta,
        Column("id", String(36), primary_key=True),
        Column("station_id", String(36), nullable=False),
        Column("user_id", String(36), nullable=False),
        Column("fuel_type_code", String(8), nullable=False),
        Column("price_per_litre", Numeric(10, 2)),
        Column("queue_length", String(12)),
        Column("photo_url", String(512)),
        Column("notes", Text),
        Column("status", String(20), nullable=False, default="pending"),
        Column("verified_at", DateTime),
        Column("ai_confidence_score", Numeric(4, 3)),
        Column("reviewed_by", String(36)),
        Column("reviewed_at", DateTime),
        Column("rejection_reason", Text),
        Column("reviewer_notes", Text),
        Column("created_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
        Column("updated_at", DateTime, server_default=text("CURRENT_TIMESTAMP")),
    )

    return meta


_MODELS_TO_REBIND = ("FuelStation", "FuelStationFuelType", "FuelType", "User", "FuelReport")


@contextmanager
def rebind_portable_tables() -> Iterator[dict[str, Table]]:
    """Context manager that rebinds the ORM models to portable tables.

    Yields ``{model_name: portable_table}``. Restores the original tables on
    exit. Not thread-safe — tests run sequentially.
    """
    from app.models import fuel_report as _fr_module
    from app.models import fuel_station as _fs_module
    from app.models import fuel_station_fuel_type as _fsft_module
    from app.models import fuel_type as _ft_module
    from app.models import user as _user_module

    meta = build_portable_metadata()
    modules = {
        "FuelStation": _fs_module,
        "FuelStationFuelType": _fsft_module,
        "FuelType": _ft_module,
        "User": _user_module,
        "FuelReport": _fr_module,
    }
    saved: dict[str, Any] = {}
    for model_name, module in modules.items():
        saved[model_name] = getattr(module, model_name).__table__
        getattr(module, model_name).__table__ = meta.tables[_table_name(model_name)]
    try:
        yield {name: meta.tables[_table_name(name)] for name in _MODELS_TO_REBIND}
    finally:
        for model_name, module in modules.items():
            getattr(module, model_name).__table__ = saved[model_name]


def _table_name(model_name: str) -> str:
    return {
        "FuelStation": "fuel_stations",
        "FuelStationFuelType": "fuel_station_fuel_types",
        "FuelType": "fuel_types",
        "User": "users",
        "FuelReport": "fuel_reports",
    }[model_name]


def portable_location_wkt(latitude: float, longitude: float) -> str:
    """WKT string used in place of a real geography point on SQLite.

    Mirrors the production ``POINT(longitude latitude)`` axis order.
    """
    return f"POINT({longitude} {latitude})"


class AuthedClient:
    """HTTP client wrapper that authenticates EVERY request as ``user``.

    ``get_current_user`` is a single global dependency override on the app, so
    a plain ``authenticated_as``-style override leaks the last-set identity
    into every subsequent request. Wrapping the client and re-asserting the
    override per request gives each user real request isolation.
    """

    def __init__(self, client, user: Any, app: Any, get_current_user: Any) -> None:
        self._client = client
        self._user = user
        self._app = app
        self._get_current_user = get_current_user

    def _apply(self) -> None:
        self._app.dependency_overrides[self._get_current_user] = (
            lambda: self._user
        )

    async def get(self, *args, **kwargs):
        self._apply()
        return await self._client.get(*args, **kwargs)

    async def post(self, *args, **kwargs):
        self._apply()
        return await self._client.post(*args, **kwargs)

    async def patch(self, *args, **kwargs):
        self._apply()
        return await self._client.patch(*args, **kwargs)

    async def put(self, *args, **kwargs):
        self._apply()
        return await self._client.put(*args, **kwargs)

    async def delete(self, *args, **kwargs):
        self._apply()
        return await self._client.delete(*args, **kwargs)


def make_id() -> str:
    return str(uuid.uuid4())
