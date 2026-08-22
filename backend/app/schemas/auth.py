"""Auth-related Pydantic schemas (roles, decoded token claims)."""

from __future__ import annotations

from pydantic import BaseModel


class RoleInfo(BaseModel):
    """A single application role advertised to clients (e.g. for sign-up UI)."""

    name: str
    value: str
    description: str


class TokenClaims(BaseModel):
    """Convenience shape for the verified Supabase JWT payload."""

    sub: str | None = None
    email: str | None = None
    # NOTE: Supabase's own ``role`` claim (anon/authenticated/service_role) is
    # unrelated to our application roles and is exposed here for diagnostics.
    role: str | None = None
    exp: int | None = None
