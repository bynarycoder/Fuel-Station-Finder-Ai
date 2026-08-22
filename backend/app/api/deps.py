"""
Shared FastAPI dependencies for authentication and authorization.

Flow on every protected request:

1. ``oauth2_scheme`` extracts the ``Bearer`` token from the ``Authorization``
   header.
2. ``get_current_user`` verifies the Supabase JWT, then *just-in-time*
   provisions (creates or refreshes) the matching local ``User`` row, returning
   the ORM object. Disabled accounts are rejected.
3. ``require_roles`` is a dependency factory that builds per-endpoint role gates
   on top of ``get_current_user``.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    ExpiredTokenError,
    InvalidTokenError,
    decode_supabase_token,
)
from app.models import User, UserRole

# ``tokenUrl`` is only used by Swagger UI; Supabase actually mints tokens.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)

_WWW_AUTHENTICATE = {"WWW-Authenticate": "Bearer"}


async def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Resolve the authenticated user from a Supabase JWT, JIT-provisioning the
    local profile if it does not yet exist."""
    if not token:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Not authenticated",
            headers=_WWW_AUTHENTICATE,
        )

    try:
        payload = decode_supabase_token(token)
    except ExpiredTokenError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            str(exc),
            headers=_WWW_AUTHENTICATE,
        ) from exc
    except InvalidTokenError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            str(exc),
            headers=_WWW_AUTHENTICATE,
        ) from exc

    user = await _provision_user(db, payload)

    if not user.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This account has been disabled. Contact an administrator.",
        )
    return user


def require_roles(*allowed: UserRole) -> Callable[..., Any]:
    """Dependency factory: allow the request only if the user holds one of the
    given application roles. Usage::

        @router.get("/admin", dependencies=[Depends(require_roles(UserRole.ADMIN))])
    """
    if not allowed:
        raise ValueError("require_roles() requires at least one role")

    async def _enforce_role(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You do not have permission to perform this action.",
            )
        return current_user

    return _enforce_role


# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #
async def _provision_user(db: AsyncSession, payload: dict[str, Any]) -> User:
    """Create or update the local ``User`` row that mirrors the Supabase identity
    carried by ``payload``. Supabase remains the source of truth for identity;
    the application role is only *seeded* here (default Driver) and thereafter
    managed locally (admin promotion in a later phase)."""
    user_id = _extract_user_id(payload)
    email = payload.get("email")
    if not email:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token is missing the user's email claim.",
            headers=_WWW_AUTHENTICATE,
        )

    full_name = _extract_full_name(payload)

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()

    if user is None:
        user = User(
            id=user_id,
            email=email,
            full_name=full_name,
            role=UserRole.DRIVER,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    # Keep mutable, identity-owned fields in sync with the token.
    dirty = False
    if user.email != email:
        user.email = email
        dirty = True
    if full_name is not None and user.full_name != full_name:
        user.full_name = full_name
        dirty = True
    if dirty:
        await db.commit()
        await db.refresh(user)
    return user


def _extract_user_id(payload: dict[str, Any]) -> uuid.UUID:
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token is missing the subject (sub) claim.",
            headers=_WWW_AUTHENTICATE,
        )
    try:
        return uuid.UUID(str(sub))
    except (ValueError, AttributeError) as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token subject is not a valid user identifier.",
            headers=_WWW_AUTHENTICATE,
        ) from exc


def _extract_full_name(payload: dict[str, Any]) -> str | None:
    user_metadata = payload.get("user_metadata") or {}
    return user_metadata.get("full_name") or user_metadata.get("name")


# Convenience annotation used across route handlers.
CurrentUser = Annotated[User, Depends(get_current_user)]
