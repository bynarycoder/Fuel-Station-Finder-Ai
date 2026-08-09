"""
Supabase JWT verification.

Supabase Auth is the system of record for authentication: it issues signed JSON
Web Tokens to authenticated clients, and this module verifies those tokens with
the Supabase project's asymmetric JWKS keys. The token's unverified header is
used only to select a public key by ``kid``; the payload is never used until the
signature and registered claims have been verified.

The verifier is intentionally independent of FastAPI and the database so it can
be tested in isolation and reused by request dependencies.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

import httpx
import jwt
from jwt import PyJWK

from app.core.config import settings

logger = logging.getLogger(__name__)

_EXPECTED_ALGORITHM = "ES256"
_EXPECTED_SUPABASE_ROLE = "authenticated"
_DEFAULT_JWKS_TIMEOUT_SECONDS = 5.0
_MAX_LOG_VALUE_LENGTH = 128


class AuthenticationError(Exception):
    """Base class for all authentication failures surfaced to callers."""


class SecurityConfigError(RuntimeError):
    """Raised when the service is misconfigured for JWT verification."""


class InvalidTokenError(AuthenticationError):
    """The token is malformed, tampered with, or fails verification."""


class ExpiredTokenError(InvalidTokenError):
    """The token was well-formed but has passed its expiry time."""


class _JWKSUnavailableError(InvalidTokenError):
    """The trusted Supabase key set could not be obtained."""


class _JWKSCache:
    """Small, process-local JWKS cache with rotation-aware key lookup.

    A cache miss for a requested ``kid`` forces one refresh even when the
    current cache has not expired. That is what allows a newly rotated Supabase
    signing key to be accepted without waiting for the normal TTL. The lock
    prevents concurrent first requests from issuing duplicate refreshes.
    """

    def __init__(self) -> None:
        self._keys: dict[str, dict[str, Any]] = {}
        self._fetched_at = 0.0
        self._url = ""
        self._lock = threading.Lock()

    def get(self, kid: str, url: str, ttl_seconds: int) -> dict[str, Any]:
        if ttl_seconds <= 0:
            raise SecurityConfigError(
                "SUPABASE_JWKS_CACHE_TTL_SECONDS must be greater than zero."
            )

        with self._lock:
            now = time.monotonic()
            cache_is_fresh = (
                self._url == url and now - self._fetched_at < ttl_seconds
            )

            # A matching key can be used without a network request while the
            # cache is fresh. A missing kid always triggers the rotation refresh.
            if cache_is_fresh and kid in self._keys:
                return self._keys[kid]

            try:
                key_set = _fetch_jwks(url)
            except _JWKSUnavailableError:
                raise
            except Exception as exc:  # pragma: no cover - defensive boundary
                raise _JWKSUnavailableError(
                    "Could not obtain trusted Supabase signing keys."
                ) from exc

            self._keys = _index_jwks(key_set)
            self._fetched_at = time.monotonic()
            self._url = url

            key = self._keys.get(kid)
            if key is None:
                raise InvalidTokenError("No trusted signing key matches the token.")
            return key

    def clear(self) -> None:
        """Clear cached keys; primarily useful for tests and key reconfiguration."""
        with self._lock:
            self._keys = {}
            self._fetched_at = 0.0
            self._url = ""


_jwks_cache = _JWKSCache()


def clear_jwks_cache() -> None:
    """Clear the process-local JWKS cache.

    The application never needs to call this during normal operation. It is
    exposed so tests can isolate key sets and so an embedding application can
    clear keys after a configuration change without restarting the process.
    """
    _jwks_cache.clear()


def _safe_log_value(value: Any) -> str:
    """Return a bounded, single-line value suitable for security logs."""
    if value is None:
        return "-"
    text = str(value).replace("\r", "").replace("\n", "")
    return text[:_MAX_LOG_VALUE_LENGTH]


def _log_verification_failure(
    category: str,
    header: dict[str, Any] | None = None,
    *,
    issuer_valid: bool | None = None,
) -> None:
    """Log verification metadata without logging a JWT or Authorization header."""
    header = header or {}
    logger.warning(
        "Supabase JWT verification failed: category=%s algorithm=%s kid=%s "
        "issuer_valid=%s",
        category,
        _safe_log_value(header.get("alg")),
        _safe_log_value(header.get("kid")),
        "not_checked" if issuer_valid is None else issuer_valid,
    )


def _fetch_jwks(url: str) -> dict[str, Any]:
    """Fetch and minimally validate a Supabase JWKS document."""
    try:
        response = httpx.get(
            url,
            timeout=_DEFAULT_JWKS_TIMEOUT_SECONDS,
            follow_redirects=False,
        )
        response.raise_for_status()
        document = response.json()
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.error("Supabase JWKS fetch failed: category=jwks_fetch_failed")
        raise _JWKSUnavailableError(
            "Could not obtain trusted Supabase signing keys."
        ) from exc

    if not isinstance(document, dict) or not isinstance(document.get("keys"), list):
        logger.error("Supabase JWKS fetch failed: category=invalid_jwks_document")
        raise _JWKSUnavailableError("Supabase JWKS document is invalid.")
    return document


def _index_jwks(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Index JWKs by kid, rejecting ambiguous duplicate key identifiers."""
    indexed: dict[str, dict[str, Any]] = {}
    for raw_key in document["keys"]:
        if not isinstance(raw_key, dict):
            continue
        kid = raw_key.get("kid")
        if not isinstance(kid, str) or not kid:
            continue
        if kid in indexed:
            logger.error("Supabase JWKS is invalid: category=duplicate_kid")
            raise _JWKSUnavailableError("Supabase JWKS contains duplicate key ids.")
        indexed[kid] = raw_key
    return indexed


def _get_unverified_header(token: str) -> dict[str, Any]:
    """Read only the header needed for key selection, never authentication."""
    try:
        header = jwt.get_unverified_header(token)
    except (jwt.DecodeError, jwt.InvalidTokenError, TypeError, ValueError) as exc:
        _log_verification_failure("malformed_header")
        raise InvalidTokenError("Could not validate credentials.") from exc

    if not isinstance(header, dict):
        _log_verification_failure("malformed_header")
        raise InvalidTokenError("Could not validate credentials.")
    return header


def _validate_es256_header(header: dict[str, Any]) -> str:
    algorithm = header.get("alg")
    kid = header.get("kid")

    if algorithm != _EXPECTED_ALGORITHM:
        _log_verification_failure("unsupported_algorithm", header)
        raise InvalidTokenError("Could not validate credentials.")
    if header.get("typ") != "JWT":
        _log_verification_failure("invalid_token_type", header)
        raise InvalidTokenError("Could not validate credentials.")
    if not isinstance(kid, str) or not kid:
        _log_verification_failure("missing_kid", header)
        raise InvalidTokenError("Could not validate credentials.")
    return kid


def _validate_jwk(jwk: dict[str, Any], kid: str) -> None:
    """Ensure the selected key is an EC P-256 verification key for ES256."""
    if jwk.get("kid") != kid:
        raise InvalidTokenError("No trusted signing key matches the token.")
    if jwk.get("kty") != "EC" or jwk.get("crv") != "P-256":
        raise InvalidTokenError("No trusted signing key matches the token.")
    if jwk.get("alg") not in (None, _EXPECTED_ALGORITHM):
        raise InvalidTokenError("No trusted signing key matches the token.")
    if jwk.get("use") not in (None, "sig"):
        raise InvalidTokenError("No trusted signing key matches the token.")
    key_ops = jwk.get("key_ops")
    if key_ops is not None and (
        not isinstance(key_ops, list) or "verify" not in key_ops
    ):
        raise InvalidTokenError("No trusted signing key matches the token.")
    if not isinstance(jwk.get("x"), str) or not isinstance(jwk.get("y"), str):
        raise InvalidTokenError("No trusted signing key matches the token.")


def _build_signing_key(jwk: dict[str, Any], kid: str) -> Any:
    try:
        _validate_jwk(jwk, kid)
        return PyJWK(jwk).key
    except InvalidTokenError:
        raise
    except (KeyError, TypeError, ValueError) as exc:
        raise InvalidTokenError("No trusted signing key matches the token.") from exc


def _decode_verified(
    token: str,
    signing_key: Any,
    *,
    issuer: str,
    audience: str,
    header: dict[str, Any],
) -> dict[str, Any]:
    """Verify the signature and all required Supabase claims with PyJWT."""
    try:
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=[_EXPECTED_ALGORITHM],
            issuer=issuer,
            audience=audience,
            options={
                "require": ["exp", "sub", "iss", "aud", "role"],
                "verify_signature": True,
            },
        )
    except jwt.ExpiredSignatureError as exc:
        _log_verification_failure("expired", header)
        raise ExpiredTokenError("Authentication token has expired.") from exc
    except jwt.InvalidIssuerError as exc:
        _log_verification_failure("wrong_issuer", header, issuer_valid=False)
        raise InvalidTokenError("Could not validate credentials.") from exc
    except jwt.InvalidAudienceError as exc:
        # PyJWT validates the issuer before audience after the signature passes.
        _log_verification_failure("wrong_audience", header, issuer_valid=True)
        raise InvalidTokenError("Could not validate credentials.") from exc
    except jwt.InvalidSignatureError as exc:
        _log_verification_failure("invalid_signature", header)
        raise InvalidTokenError("Could not validate credentials.") from exc
    except jwt.MissingRequiredClaimError as exc:
        _log_verification_failure("missing_required_claim", header)
        raise InvalidTokenError("Could not validate credentials.") from exc
    except jwt.InvalidTokenError as exc:
        _log_verification_failure("invalid_token", header)
        raise InvalidTokenError("Could not validate credentials.") from exc

    # PyJWT has already verified iss/aud before returning. Keep the exact
    # audience and Supabase role checks explicit so a token intended for another
    # audience or a service-role token cannot enter the application.
    if payload.get("iss") != issuer:
        _log_verification_failure("wrong_issuer", header, issuer_valid=False)
        raise InvalidTokenError("Could not validate credentials.")
    if payload.get("aud") != audience:
        _log_verification_failure("wrong_audience", header)
        raise InvalidTokenError("Could not validate credentials.")
    if payload.get("role") != _EXPECTED_SUPABASE_ROLE:
        _log_verification_failure("wrong_supabase_role", header, issuer_valid=True)
        raise InvalidTokenError("Could not validate credentials.")

    return payload


def decode_supabase_token(token: str) -> dict[str, Any]:
    """Verify and decode a Supabase ES256 access token.

    The token header is parsed only to obtain ``alg`` and ``kid``. The matching
    public JWK is fetched from the configured Supabase project, cached in
    process, and used for signature verification. A missing key triggers one
    JWKS refresh to support signing-key rotation; a token with no matching
    trusted key is rejected.

    Raises:
    * ``ExpiredTokenError`` — the verified token has passed its expiry;
    * ``InvalidTokenError`` — malformed, incorrectly signed, incorrectly
      scoped, or otherwise invalid token;
    * ``SecurityConfigError`` — required verifier configuration is missing or
      the configured algorithm is not the supported ES256 algorithm.
    """
    if not isinstance(token, str) or not token:
        _log_verification_failure("malformed_token")
        raise InvalidTokenError("Could not validate credentials.")

    if settings.SUPABASE_JWT_ALGORITHM != _EXPECTED_ALGORITHM:
        raise SecurityConfigError(
            "SUPABASE_JWT_ALGORITHM must be configured as ES256 for Supabase JWKS verification."
        )

    issuer = settings.supabase_jwt_issuer
    audience = settings.SUPABASE_JWT_AUDIENCE.strip()
    jwks_url = settings.supabase_jwks_url
    if not issuer:
        raise SecurityConfigError(
            "SUPABASE_JWT_ISSUER or SUPABASE_URL must be configured."
        )
    if not audience:
        raise SecurityConfigError(
            "SUPABASE_JWT_AUDIENCE must be configured as authenticated."
        )
    if not jwks_url:
        raise SecurityConfigError(
            "SUPABASE_JWKS_URL or SUPABASE_URL must be configured."
        )

    header = _get_unverified_header(token)
    kid = _validate_es256_header(header)

    try:
        jwk = _jwks_cache.get(
            kid,
            jwks_url,
            settings.SUPABASE_JWKS_CACHE_TTL_SECONDS,
        )
        signing_key = _build_signing_key(jwk, kid)
    except InvalidTokenError as exc:
        category = (
            "unknown_kid"
            if str(exc) == "No trusted signing key matches the token."
            else "invalid_jwk"
        )
        _log_verification_failure(category, header)
        raise InvalidTokenError("Could not validate credentials.") from exc
    except SecurityConfigError:
        raise
    except Exception as exc:  # pragma: no cover - final defensive boundary
        _log_verification_failure("jwks_unavailable", header)
        raise InvalidTokenError("Could not validate credentials.") from exc

    return _decode_verified(
        token,
        signing_key,
        issuer=issuer,
        audience=audience,
        header=header,
    )
