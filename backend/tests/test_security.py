"""
Unit tests for the pure JWT verification layer (``app.core.security``).

These exercise the real python-jose crypto round-trip — encode with the test
secret, decode through ``decode_supabase_token`` — with no database and no
FastAPI, validating every failure mode.
"""

from __future__ import annotations

import pytest
from jose import jwt as jose_jwt

from app.core import config
from app.core.security import (
    ExpiredTokenError,
    InvalidTokenError,
    SecurityConfigError,
    decode_supabase_token,
)
from tests._tokens import TEST_JWT_SECRET, mint_token


def test_decode_valid_token_roundtrip(make_token) -> None:
    token = make_token(email="ada@naija.dev", extra={"user_metadata": {"x": 1}})
    payload = decode_supabase_token(token)

    assert payload["email"] == "ada@naija.dev"
    assert payload["sub"]
    assert payload["exp"] > payload["iat"]
    assert payload["user_metadata"]["x"] == 1


def test_decode_expired_token_raises(make_token) -> None:
    token = make_token(exp_delta=-60)
    with pytest.raises(ExpiredTokenError):
        decode_supabase_token(token)


def test_decode_wrong_signature_raises() -> None:
    bad = jose_jwt.encode(
        {"sub": "x", "email": "a@b.com", "iat": 1, "exp": 9999999999},
        "a-completely-different-secret",
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError):
        decode_supabase_token(bad)


def test_decode_tampered_token_raises(make_token) -> None:
    token = make_token()
    # Flip trailing characters to break the signature.
    tampered = token[:-6] + ("A" * 6)
    with pytest.raises(InvalidTokenError):
        decode_supabase_token(tampered)


def test_decode_missing_subject_raises() -> None:
    token = jose_jwt.encode(
        {"email": "a@b.com", "iat": 1, "exp": 9999999999},
        TEST_JWT_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError):
        decode_supabase_token(token)


def test_decode_without_configured_secret_raises(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "SUPABASE_JWT_SECRET", "")
    with pytest.raises(SecurityConfigError):
        decode_supabase_token("anything")


def test_expired_is_a_subclass_of_invalid_token() -> None:
    assert issubclass(ExpiredTokenError, InvalidTokenError)


def test_audience_enforced_when_configured(monkeypatch, make_token) -> None:
    monkeypatch.setattr(config.settings, "SUPABASE_JWT_AUDIENCE", "authenticated")

    # Token without an `aud` claim must be rejected.
    with pytest.raises(InvalidTokenError):
        decode_supabase_token(make_token())

    # Token carrying the expected audience must pass.
    payload = decode_supabase_token(make_token(audience="authenticated"))
    assert payload["aud"] == "authenticated"
