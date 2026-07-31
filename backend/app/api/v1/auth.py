"""
Authentication endpoints (API v1).

Signup / login / logout / token-issuance are handled client-side by Supabase
Auth, so this router intentionally exposes only what the backend itself needs:

* ``GET /auth/me``   — returns the caller's application profile. As a side
  effect this is also where we *just-in-time provision* the local ``User`` row
  the first time a Supabase identity is seen by the backend.
* ``GET /auth/roles`` — advertises the application roles (public; useful for the
  frontend sign-up flow).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.models import UserRole
from app.schemas import RoleInfo, UserPublic

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/me", response_model=UserPublic, summary="Get the current user")
async def get_current_user_profile(current_user: CurrentUser) -> UserPublic:
    """Return the authenticated user's profile. Requires a valid Supabase JWT."""
    return current_user


@router.get(
    "/roles",
    response_model=list[RoleInfo],
    summary="List application roles",
)
async def list_user_roles() -> list[RoleInfo]:
    """Public catalogue of application roles and what each can do."""
    return [
        RoleInfo(
            name=role.name,
            value=role.value,
            description=role.description,
        )
        for role in UserRole
    ]
