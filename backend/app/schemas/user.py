"""Public Pydantic response schema for the ``User`` resource."""

from __future__ import annotations

import datetime
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.user import UserRole


class UserPublic(BaseModel):
    """Serialised view of a user, safe to return to API clients.

    Never includes credentials or any secret — authentication is handled by
    Supabase, and this payload only mirrors the user's public profile + role.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str | None = None
    role: UserRole
    is_active: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime
