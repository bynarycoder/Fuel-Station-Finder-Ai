"""
End-to-end tests for the Phase 3 auth API.

These drive the real FastAPI app (and a throwaway RBAC app) over HTTP against an
in-memory SQLite database with real HS256 JWTs — exercising JWT verification,
just-in-time user provisioning, role-based access control and account disabling.
"""

from __future__ import annotations

import uuid

from jose import jwt as jose_jwt
from sqlalchemy import select

from app.models import User, UserRole
from tests.conftest import bearer
from tests._tokens import TEST_JWT_SECRET

DRIVER_ID = "22222222-2222-2222-2222-222222222222"
IDEM_ID = "33333333-3333-3333-3333-333333333333"
EMAIL_CHANGE_ID = "44444444-4444-4444-4444-444444444444"
RBAC_DRIVER_ID = "55555555-5555-5555-5555-555555555555"
ADMIN_ID = "66666666-6666-6666-6666-666666666666"
DISABLED_ID = "77777777-7777-7777-7777-777777777777"


# --------------------------------------------------------------------------- #
# GET /api/v1/auth/me
# --------------------------------------------------------------------------- #
async def test_me_without_token_returns_401(client) -> None:
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_me_jit_provisions_user_with_default_role(
    client, make_token
) -> None:
    token = make_token(
        sub=DRIVER_ID,
        email="tunde@naija.dev",
        extra={"user_metadata": {"full_name": "Tunde Adeyemi"}},
    )
    response = await client.get("/api/v1/auth/me", headers=bearer(token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == DRIVER_ID
    assert body["email"] == "tunde@naija.dev"
    assert body["role"] == "driver"  # default role
    assert body["full_name"] == "Tunde Adeyemi"
    assert body["is_active"] is True
    assert "password" not in body


async def test_me_is_idempotent(client, make_token, session_factory) -> None:
    token = make_token(sub=IDEM_ID, email="idem@naija.dev")
    first = await client.get("/api/v1/auth/me", headers=bearer(token))
    second = await client.get("/api/v1/auth/me", headers=bearer(token))

    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]

    async with session_factory() as session:
        users = (await session.execute(select(User))).scalars().all()
    assert len(users) == 1  # no duplicate provisioning


async def test_me_syncs_email_changes_from_token(
    client, make_token, session_factory
) -> None:
    await client.get(
        "/api/v1/auth/me",
        headers=bearer(make_token(sub=EMAIL_CHANGE_ID, email="old@naija.dev")),
    )
    await client.get(
        "/api/v1/auth/me",
        headers=bearer(make_token(sub=EMAIL_CHANGE_ID, email="new@naija.dev")),
    )

    async with session_factory() as session:
        user = (
            await session.execute(
                select(User).where(User.id == uuid.UUID(EMAIL_CHANGE_ID))
            )
        ).scalar_one()
    assert user.email == "new@naija.dev"


async def test_me_expired_token_returns_401(client, make_token) -> None:
    token = make_token(exp_delta=-60)
    response = await client.get("/api/v1/auth/me", headers=bearer(token))
    assert response.status_code == 401


async def test_me_bad_signature_returns_401(client) -> None:
    token = jose_jwt.encode(
        {"sub": DRIVER_ID, "email": "a@b.com", "iat": 1, "exp": 9999999999},
        "the-wrong-secret",
        algorithm="HS256",
    )
    response = await client.get("/api/v1/auth/me", headers=bearer(token))
    assert response.status_code == 401


async def test_disabled_account_is_forbidden(
    client, make_token, session_factory
) -> None:
    async with session_factory() as session:
        session.add(
            User(
                id=uuid.UUID(DISABLED_ID),
                email="off@naija.dev",
                role=UserRole.DRIVER,
                is_active=False,
            )
        )
        await session.commit()

    token = make_token(sub=DISABLED_ID, email="off@naija.dev")
    response = await client.get("/api/v1/auth/me", headers=bearer(token))
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# GET /api/v1/auth/roles
# --------------------------------------------------------------------------- #
async def test_roles_endpoint_is_public_and_lists_all_roles(client) -> None:
    response = await client.get("/api/v1/auth/roles")
    assert response.status_code == 200
    values = {role["value"] for role in response.json()}
    assert values == {"driver", "station_manager", "admin"}
    for role in response.json():
        assert role["name"] and role["description"]


# --------------------------------------------------------------------------- #
# Role-based access control (require_roles)
# --------------------------------------------------------------------------- #
async def test_admin_route_denies_driver(rbac_client, make_token) -> None:
    token = make_token(sub=RBAC_DRIVER_ID, email="drv@naija.dev")
    response = await rbac_client.get("/admin", headers=bearer(token))
    assert response.status_code == 403


async def test_admin_route_allows_admin(
    rbac_client, make_token, session_factory
) -> None:
    async with session_factory() as session:
        session.add(
            User(
                id=uuid.UUID(ADMIN_ID),
                email="admin@naija.dev",
                role=UserRole.ADMIN,
            )
        )
        await session.commit()

    token = make_token(sub=ADMIN_ID, email="admin@naija.dev")
    response = await rbac_client.get("/admin", headers=bearer(token))
    assert response.status_code == 200
    assert response.json() == {"ok": True}


async def test_admin_route_rejects_missing_token(rbac_client) -> None:
    response = await rbac_client.get("/admin")
    assert response.status_code == 401


async def test_require_roles_rejects_empty_call() -> None:
    import pytest

    from app.api.deps import require_roles

    with pytest.raises(ValueError):
        require_roles()
