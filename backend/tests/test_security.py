"""Unit tests for the Supabase ES256/JWKS verification layer."""

from __future__ import annotations

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.core import config, security
from app.core.security import (
    ExpiredTokenError,
    InvalidTokenError,
    SecurityConfigError,
    decode_supabase_token,
)
from tests._tokens import (
    TEST_JWK,
    TEST_JWT_KID,
    TEST_SUPABASE_ISSUER,
    mint_token,
    public_jwk,
)


def test_decode_valid_es256_token_with_matching_jwks_key() -> None:
    token = mint_token(email="ada@naija.dev", extra={"user_metadata": {"x": 1}})
    payload = decode_supabase_token(token)

    assert payload["email"] == "ada@naija.dev"
    assert payload["sub"]
    assert payload["exp"] > payload["iat"]
    assert payload["iss"] == TEST_SUPABASE_ISSUER
    assert payload["aud"] == "authenticated"
    assert payload["user_metadata"]["x"] == 1


def test_decode_uses_cache_for_repeated_requests(monkeypatch) -> None:
    calls: list[str] = []

    def fetch(url: str) -> dict[str, list[dict[str, object]]]:
        calls.append(url)
        return {"keys": [TEST_JWK]}

    monkeypatch.setattr(security, "_fetch_jwks", fetch)
    security.clear_jwks_cache()

    decode_supabase_token(mint_token())
    decode_supabase_token(mint_token())

    assert calls == [config.settings.supabase_jwks_url]


def test_decode_refreshes_once_for_a_rotated_key(monkeypatch) -> None:
    rotated_kid = "rotated-es256-key"
    calls: list[str] = []
    responses = [
        {"keys": [TEST_JWK]},
        {"keys": [public_jwk(rotated_kid)]},
    ]

    def fetch(url: str) -> dict[str, list[dict[str, object]]]:
        calls.append(url)
        return responses.pop(0)

    monkeypatch.setattr(security, "_fetch_jwks", fetch)
    security.clear_jwks_cache()

    assert decode_supabase_token(mint_token())["sub"]
    rotated_token = mint_token(kid=rotated_kid)
    assert decode_supabase_token(rotated_token)["sub"]
    assert calls == [config.settings.supabase_jwks_url] * 2


def test_decode_invalid_signature_is_rejected() -> None:
    wrong_private_key = ec.derive_private_key(2, ec.SECP256R1())
    token = mint_token(signing_key=wrong_private_key)

    with pytest.raises(InvalidTokenError):
        decode_supabase_token(token)


def test_verification_logs_metadata_without_the_token(caplog) -> None:
    wrong_private_key = ec.derive_private_key(2, ec.SECP256R1())
    token = mint_token(signing_key=wrong_private_key)

    with caplog.at_level("WARNING", logger="app.core.security"):
        with pytest.raises(InvalidTokenError):
            decode_supabase_token(token)

    assert token not in caplog.text
    assert "invalid_signature" in caplog.text
    assert TEST_JWT_KID in caplog.text


def test_decode_unknown_kid_is_rejected() -> None:
    token = mint_token(kid="not-in-the-trusted-jwks")

    with pytest.raises(InvalidTokenError):
        decode_supabase_token(token)


def test_decode_expired_token_is_rejected() -> None:
    token = mint_token(exp_delta=-60)

    with pytest.raises(ExpiredTokenError):
        decode_supabase_token(token)


def test_decode_wrong_issuer_is_rejected() -> None:
    token = mint_token(issuer="https://attacker.example/auth/v1")

    with pytest.raises(InvalidTokenError):
        decode_supabase_token(token)


def test_decode_wrong_audience_is_rejected() -> None:
    token = mint_token(audience="anon")

    with pytest.raises(InvalidTokenError):
        decode_supabase_token(token)


def test_decode_malformed_jwt_is_rejected() -> None:
    with pytest.raises(InvalidTokenError):
        decode_supabase_token("not-a-jwt")


def test_decode_requires_supabase_authenticated_role() -> None:
    token = mint_token(extra={"role": "service_role"})

    with pytest.raises(InvalidTokenError):
        decode_supabase_token(token)


def test_decode_missing_required_claim_is_rejected() -> None:
    token = mint_token(audience=None, issuer=None)

    with pytest.raises(InvalidTokenError):
        decode_supabase_token(token)


def test_decode_without_jwks_configuration_raises(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "SUPABASE_JWT_ISSUER", "")
    monkeypatch.setattr(config.settings, "SUPABASE_URL", "")
    monkeypatch.setattr(config.settings, "SUPABASE_JWKS_URL", "")

    with pytest.raises(SecurityConfigError):
        decode_supabase_token("anything")


def test_expired_is_a_subclass_of_invalid_token() -> None:
    assert issubclass(ExpiredTokenError, InvalidTokenError)


def test_header_algorithm_must_be_es256() -> None:
    token = jwt.encode(
        {
            "sub": "11111111-1111-1111-1111-111111111111",
            "iss": TEST_SUPABASE_ISSUER,
            "aud": "authenticated",
            "role": "authenticated",
            "exp": 9_999_999_999,
        },
        "not-used-as-an-es256-key-but-long-enough",
        algorithm="HS256",
        headers={"kid": TEST_JWT_KID},
    )

    with pytest.raises(InvalidTokenError):
        decode_supabase_token(token)
