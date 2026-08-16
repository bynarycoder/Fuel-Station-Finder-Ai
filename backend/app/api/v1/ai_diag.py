"""
AI provider diagnostic endpoint.

Exposes a safe, credential-free status probe for Groq and Gemini so operators
(and Render logs / smoke tests) can distinguish "configured" from "actually
working" without ever exposing API keys. The endpoint is public because it
returns no secrets and only makes cheap, bounded SDK requests; it never touches
the database or the station/report catalogue.

Each check reports one of: "PASS", "FAIL", "SKIPPED", plus a short safe error
category (no request bodies, no headers, no keys).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Diagnostics"])


def _category(exc: BaseException) -> str:
    """Return a short, non-sensitive error category for an exception."""
    name = type(exc).__name__
    # Group into generic buckets so messages never leak prompts/keys.
    for needle in ("Timeout", "timeout", "Deadline"):
        if needle in name:
            return "TIMEOUT"
    for needle in ("Auth", "Key", "Permission", "Credential", "Unauthorized", "Forbidden"):
        if needle in name:
            return "AUTH_ERROR"
    for needle in ("Connection", "Network", "DNS", "Proxy"):
        if needle in name:
            return "NETWORK_ERROR"
    for needle in ("TypeError", "AttributeError", "ValueError"):
        if needle in name:
            return "SDK_PARAMETER_ERROR"
    if "RateLimit" in name or "Too Many" in str(exc):
        return "RATE_LIMITED"
    if "NotFound" in name or "404" in str(exc):
        return "MODEL_NOT_FOUND"
    return "PROVIDER_ERROR"


def _groq_checks() -> dict[str, Any]:
    result: dict[str, Any] = {
        "provider": "groq",
        "api_key_configured": bool(settings.GROQ_API_KEY),
        "model": settings.GROQ_MODEL,
        "client_initialization": "SKIPPED",
        "intent_parsing": "SKIPPED",
        "explanation_generation": "SKIPPED",
        "fallback": "SKIPPED",
    }

    # 1. Fallback path is always available (no SDK required).
    try:
        from app.services.ai import recommend

        intent = recommend.parse_intent_fallback("cheapest petrol near me")
        result["fallback"] = "PASS" if intent.fuel_type == "PMS" and intent.sort_preference == "price" else "FAIL"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] fallback check failed: %s", exc)
        result["fallback"] = f"FAIL: {_category(exc)}"
        return result

    if not settings.GROQ_API_KEY:
        result["client_initialization"] = "SKIPPED: no API key"
        result["intent_parsing"] = "SKIPPED: no API key"
        result["explanation_generation"] = "SKIPPED: no API key"
        return result

    # 2. Client initialization (no network yet).
    try:
        from groq import Groq

        client = Groq(
            api_key=settings.GROQ_API_KEY,
            timeout=settings.AI_TIMEOUT_SECONDS,
            max_retries=0,
        )
        result["client_initialization"] = "PASS"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] Groq client init failed: %s", exc)
        result["client_initialization"] = f"FAIL: {_category(exc)}"
        return result

    # 3. Intent parsing (live request).
    try:
        from app.services.ai import recommend

        intent = recommend.parse_recommend_intent("cheapest petrol near me")
        result["intent_parsing"] = (
            "PASS"
            if intent.fuel_type == "PMS" and intent.sort_preference == "price"
            else "FAIL: unexpected_intent"
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] Groq intent parsing failed: %s", exc)
        result["intent_parsing"] = f"FAIL: {_category(exc)}"
        return result

    # 4. Explanation generation (live request, single canned candidate).
    try:
        from app.services.ai import recommend

        station = {
            "id": "diag",
            "name": "Diagnostic Station",
            "brand": None,
            "city": "Test",
            "state": "Test",
            "latitude": 0.0,
            "longitude": 0.0,
            "is_active": True,
            "data_source": "seed",
            "verification_status": "verified",
            "fuel_types": [{"code": "PMS", "name": "Petrol (PMS)"}],
            "distance_meters": 500.0,
        }
        intent = recommend.FuelSearchIntent(
            fuel_type="PMS",
            sort_preference="best_overall",
            raw="cheapest petrol near me",
        )
        price_map = {
            "diag": [
                {
                    "fuel_type_code": "PMS",
                    "price_per_litre": 900.0,
                    "status": "verified",
                    "created_at": None,
                }
            ]
        }
        ranked = recommend.rank_recommendations([station], intent, price_map)
        answer = recommend.generate_explanation(intent, ranked)
        result["explanation_generation"] = "PASS" if isinstance(answer, str) and answer.strip() else "FAIL: empty"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] Groq explanation generation failed: %s", exc)
        result["explanation_generation"] = f"FAIL: {_category(exc)}"
        return result

    return result


def _gemini_checks() -> dict[str, Any]:
    result: dict[str, Any] = {
        "provider": "gemini",
        "api_key_configured": bool(settings.GEMINI_API_KEY),
        "model": settings.GEMINI_MODEL,
        "sdk": None,
        "client_initialization": "SKIPPED",
        "live_verification_request": "SKIPPED",
        "response_parsing": "SKIPPED",
        "failure_handling": "SKIPPED",
    }

    # 1. SDK presence & version.
    try:
        import google.generativeai as genai

        result["sdk"] = f"google-generativeai=={getattr(genai, '__version__', 'unknown')}"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] Gemini SDK import failed: %s", exc)
        result["sdk"] = f"unavailable: {_category(exc)}"
        result["client_initialization"] = "FAIL: SDK_NOT_INSTALLED"
        return result

    # 2. Response parser is always available (no key needed).
    try:
        from app.services.ai import gemini

        parsed = gemini.parse_verification_response(
            '{"score":0.9,"is_plausible":true,"summary":"queue","detected_attributes":["pumps"]}'
        )
        malformed = gemini.parse_verification_response("not json")
        result["response_parsing"] = (
            "PASS"
            if parsed.score == 0.9
            and parsed.is_plausible
            and malformed.score == 0.0
            and malformed.is_plausible is False
            else "FAIL"
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] Gemini parser check failed: %s", exc)
        result["response_parsing"] = f"FAIL: {_category(exc)}"

    # 3. Failure handling: verify the parser and error-result helper behave
    # safely for malformed input. We deliberately do NOT make a live API call
    # from a diagnostic ping: analyze_queue_image with real bytes would hit
    # the network. The unit tests exercise SDK/network failures via mocks.
    try:
        from app.services.ai import gemini

        malformed = gemini.parse_verification_response("not json at all")
        null_parse = gemini.parse_verification_response(None)
        result["failure_handling"] = (
            "PASS"
            if malformed.score == 0.0 and null_parse.score == 0.0
            else "FAIL: parser did not return safe defaults"
        )
    except Exception as exc:  # noqa: BLE001
        result["failure_handling"] = f"FAIL: {_category(exc)}"

    if not settings.GEMINI_API_KEY:
        result["client_initialization"] = "SKIPPED: no API key"
        result["live_verification_request"] = "SKIPPED: no API key"
        return result

    # 4. Client init (configure + GenerativeModel construction).
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        _ = genai.GenerativeModel(settings.GEMINI_MODEL)
        result["client_initialization"] = "PASS"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] Gemini client init failed: %s", exc)
        result["client_initialization"] = f"FAIL: {_category(exc)}"
        return result

    # 5. Live verification is intentionally NOT run here: it would upload a
    # fabricated image and bill against the API on every /diag ping. Operators
    # can exercise the live path via POST /api/v1/reports/{id}/verify. Mark
    # this explicitly as NOT PROVEN from a ping.
    result["live_verification_request"] = "NOT_PROVEN: use POST /api/v1/reports/{id}/verify"

    return result


@router.get(
    "/diagnostic",
    summary="AI provider diagnostic (safe, credential-free)",
)
async def ai_diagnostic() -> dict[str, Any]:
    """Return the health of the Groq and Gemini AI integrations.

    * No API keys or secrets are included.
    * Groq performs tiny bounded probes (short JSON intent + 1-candidate
      explanation) so a broken config fails fast rather than hiding behind
      the deterministic fallback.
    * Gemini checks SDK presence, parsing, failure handling, and client
      construction; the live image request is left to the verify endpoint.
    """
    return {
        "groq": _groq_checks(),
        "gemini": _gemini_checks(),
    }
