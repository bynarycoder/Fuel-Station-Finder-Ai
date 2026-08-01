"""
Supabase JWT verification.

Supabase Auth is the system of record for authentication: it issues signed JSON
Web Tokens to authenticated clients, and this module is responsible for
verifying those tokens on the backend. We verify the signature, expiry and
( optionally) audience — we do **not** validate passwords, which Supabase owns.

The functions here are deliberately pure (no FastAPI / DB coupling) so they can
be unit-tested in isolation and reused outside of request handling.
"""

from __future__ import annotations

from typing import Any

from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

from app.core.config import settings


class AuthenticationError(Exception):
    """Base class for all authentication failures surfaced to callers."""


class SecurityConfigError(RuntimeError):
    """Raised when the service is mis-configured (e.g. missing JWT secret)."""


class InvalidTokenError(AuthenticationError):
    """The token is malformed, tampered with, or fails verification."""


class ExpiredTokenError(InvalidTokenError):
    """The token was well-formed but has passed its expiry time."""


def decode_supabase_token(token: str) -> dict[str, Any]:
    """
    Verify and decode a Supabase access token.

    Returns the JWT payload (a ``dict``) on success and raises:
    * ``ExpiredTokenError`` — the signature is valid but the token expired;
    * ``InvalidTokenError`` — bad signature, malformed token, missing required
      claims or audience mismatch;
    * ``SecurityConfigError`` — the JWT secret is not configured.

    The ``sub`` (Supabase user id) and ``exp`` (expiry) claims are always
    required; ``aud`` is only verified when ``SUPABASE_JWT_AUDIENCE`` is set.
    """
    secret = settings.SUPABASE_JWT_SECRET
    if not secret:
        raise SecurityConfigError(
            "SUPABASE_JWT_SECRET is not configured; cannot verify tokens."
        )

    decode_kwargs: dict[str, Any] = {
        "algorithms": [settings.SUPABASE_JWT_ALGORITHM],
        # python-jose uses per-claim ``require_*`` flags (not a ``require`` list).
        "options": {"require_sub": True, "require_exp": True},
    }
    audience = settings.SUPABASE_JWT_AUDIENCE
    if audience:
        # ``_validate_aud`` only checks *matching*; ``require_aud`` additionally
        # rejects tokens that omit the claim entirely.
        decode_kwargs["audience"] = audience
        decode_kwargs["options"]["require_aud"] = True

    try:
        return jwt.decode(token, secret, **decode_kwargs)
    except ExpiredSignatureError as exc:
        raise ExpiredTokenError("Authentication token has expired.") from exc
    except JWTError as exc:
        raise InvalidTokenError("Could not validate credentials.") from exc
