"""Shared helpers for minting Supabase-style ES256 JWTs in the test suite."""

from __future__ import annotations

import base64
import time
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

TEST_SUPABASE_URL = "https://test.supabase.co"
TEST_SUPABASE_ISSUER = f"{TEST_SUPABASE_URL}/auth/v1"
TEST_JWKS_URL = f"{TEST_SUPABASE_ISSUER}/.well-known/jwks.json"
TEST_JWT_KID = "test-es256-key"

# Deterministic test-only key material. It is never used outside the test suite.
TEST_EC_PRIVATE_KEY = ec.derive_private_key(1, ec.SECP256R1())
TEST_EC_PUBLIC_KEY = TEST_EC_PRIVATE_KEY.public_key()


def _base64url_uint(value: int) -> str:
    raw = value.to_bytes(32, byteorder="big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def public_jwk(kid: str = TEST_JWT_KID) -> dict[str, Any]:
    numbers = TEST_EC_PUBLIC_KEY.public_numbers()
    return {
        "alg": "ES256",
        "crv": "P-256",
        "ext": True,
        "key_ops": ["verify"],
        "kid": kid,
        "kty": "EC",
        "use": "sig",
        "x": _base64url_uint(numbers.x),
        "y": _base64url_uint(numbers.y),
    }


TEST_JWK = public_jwk()


def mint_token(
    sub: str = "11111111-1111-1111-1111-111111111111",
    email: str = "user@example.com",
    exp_delta: int = 3600,
    audience: str | None = "authenticated",
    issuer: str | None = TEST_SUPABASE_ISSUER,
    kid: str = TEST_JWT_KID,
    signing_key: Any = TEST_EC_PRIVATE_KEY,
    extra: dict[str, Any] | None = None,
) -> str:
    """Mint a valid ES256 Supabase-style access token for the given identity."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": sub,
        "email": email,
        "role": "authenticated",
        "iat": now,
        "exp": now + exp_delta,
    }
    if audience is not None:
        payload["aud"] = audience
    if issuer is not None:
        payload["iss"] = issuer
    if extra:
        payload.update(extra)
    return jwt.encode(
        payload,
        signing_key,
        algorithm="ES256",
        headers={"kid": kid, "typ": "JWT"},
    )
