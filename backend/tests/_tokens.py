"""Shared helpers for minting Supabase-style JWTs in the test-suite.

Kept outside ``conftest.py`` so that both fixtures and plain unit tests can
import the constant/helper without importing conftest (which pytest owns).
"""

from __future__ import annotations

import time
from typing import Any

from jose import jwt as jose_jwt

# A deterministic secret used only by the tests. Production uses the real
# Supabase JWT secret via settings.
TEST_JWT_SECRET = "phase3-test-jwt-secret-not-for-production"


def mint_token(
    sub: str = "11111111-1111-1111-1111-111111111111",
    email: str = "user@example.com",
    exp_delta: int = 3600,
    audience: str | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    """Mint a valid HS256 Supabase-style access token for the given identity."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": sub,
        "email": email,
        "role": "authenticated",  # Supabase's own claim; not our app role
        "iat": now,
        "exp": now + exp_delta,
    }
    if audience:
        payload["aud"] = audience
    if extra:
        payload.update(extra)
    return jose_jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")
