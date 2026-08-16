"""
AI provider diagnostic endpoint.

Exposes a safe, credential-free status probe for Groq and Gemini so operators
(and Render logs / smoke tests) can distinguish "configured" from "actually
working" without ever exposing API keys. The endpoint is public because it
returns no secrets and only makes cheap, bounded SDK requests; it never touches
the database or the station/report catalogue.

Each check reports one of: "PASS", "FAIL", "SKIPPED", plus a short safe error
category (no request bodies, no headers, no keys).

``GET /ai/diagnostic`` runs the cheap Groq probes and Gemini's offline checks.
``GET /ai/diagnostic?live=true`` additionally performs the smallest possible
LIVE Gemini request (a text-only "reply OK" prompt) plus a Groq smoke test, so
a retired model or a rejected key is proven rather than assumed. It is opt-in
because it bills a token against each provider.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.core.config import settings
from app.services.ai.provider import AIProviderError, classify_provider_error

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Diagnostics"])

GROQ_SMOKE_TOKEN = "GROQ_SMOKE_TEST_OK"


def _category(exc: BaseException) -> str:
    """Return a short, non-sensitive error category for an exception.

    ``AIProviderError`` already carries the classification made at the call
    site (and was logged there), so it is used verbatim rather than being
    re-classified into a generic bucket.
    """
    if isinstance(exc, AIProviderError):
        category, status = exc.category, exc.status_code
    else:
        category, status = classify_provider_error(exc)
    return f"{category}" if status is None else f"{category}:{status}"


def _groq_checks(live: bool) -> dict[str, Any]:
    result: dict[str, Any] = {
        "provider": "groq",
        "responsibility": "conversation + search intent + factual explanation",
        "api_key_configured": bool(settings.GROQ_API_KEY),
        "model": settings.GROQ_MODEL,
        "timeout_seconds": settings.AI_TIMEOUT_SECONDS,
        "max_retries": settings.AI_MAX_RETRIES,
        "client_initialization": "SKIPPED",
        "intent_parsing": "SKIPPED",
        "explanation_generation": "SKIPPED",
        "conversation": "SKIPPED",
        "smoke_test": "SKIPPED",
        "fallback": "SKIPPED",
        "router": "SKIPPED",
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

    # 2. Deterministic router (search vs. conversation) — no provider needed.
    try:
        from app.services.ai import chat as chat_service

        routes_search = chat_service.classify_query("cheapest petrol near me")
        routes_chat = chat_service.classify_query("Hello, what can you help me with?")
        result["router"] = (
            "PASS"
            if routes_search == chat_service.MODE_SEARCH
            and routes_chat == chat_service.MODE_CONVERSATION
            else f"FAIL: {routes_search}/{routes_chat}"
        )
    except Exception as exc:  # noqa: BLE001
        result["router"] = f"FAIL: {_category(exc)}"

    if not settings.GROQ_API_KEY:
        result["client_initialization"] = "SKIPPED: no API key"
        result["intent_parsing"] = "SKIPPED: no API key"
        result["explanation_generation"] = "SKIPPED: no API key"
        result["conversation"] = "SKIPPED: no API key"
        result["smoke_test"] = "SKIPPED: no API key"
        return result

    # 3. Client initialization (no network yet).
    try:
        from app.services.ai.provider import build_groq_client

        build_groq_client()
        result["client_initialization"] = "PASS"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] Groq client init failed: %s", exc)
        result["client_initialization"] = f"FAIL: {_category(exc)}"
        return result

    # 4. Intent parsing (live request).
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

    # 5. Explanation generation (live request, single canned candidate).
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

    # 6. Conversational answer (live request). Proves the general-purpose Groq
    # path — not just JSON extraction — actually answers a user's question.
    try:
        from app.services.ai import chat as chat_service

        answer = chat_service.generate_chat_answer("Hello, what can you help me with?")
        result["conversation"] = "PASS" if answer.strip() else "FAIL: empty"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] Groq conversation failed: %s", exc)
        result["conversation"] = f"FAIL: {_category(exc)}"

    # 7. Opt-in smoke test with a verbatim token, so the response can be
    # proven to come from the model rather than from any fallback.
    if live:
        try:
            from app.services.ai.provider import groq_chat

            content = groq_chat(
                [
                    {
                        "role": "system",
                        "content": "You are a test harness. Reply with the exact token you are given and nothing else.",
                    },
                    {"role": "user", "content": f"Respond with exactly: {GROQ_SMOKE_TOKEN}"},
                ],
                feature="diagnostic_smoke_test",
                temperature=0.0,
                max_completion_tokens=32,
            )
            result["smoke_test"] = (
                "PASS" if GROQ_SMOKE_TOKEN in content else f"FAIL: unexpected_content"
            )
        except Exception as exc:  # noqa: BLE001
            result["smoke_test"] = f"FAIL: {_category(exc)}"
    else:
        result["smoke_test"] = "SKIPPED: add ?live=true"

    return result


def _gemini_checks(live: bool) -> dict[str, Any]:
    result: dict[str, Any] = {
        "provider": "gemini",
        "responsibility": "report photo verification (multimodal)",
        "api_key_configured": bool(settings.GEMINI_API_KEY),
        "model": settings.GEMINI_MODEL,
        "timeout_seconds": settings.AI_TIMEOUT_SECONDS,
        "sdk": None,
        "client_initialization": "SKIPPED",
        "live_text_request": "SKIPPED",
        "model_available": "SKIPPED",
        "response_parsing": "SKIPPED",
        "failure_handling": "SKIPPED",
    }

    # 1. SDK presence & version (the supported unified SDK).
    try:
        from google import genai

        result["sdk"] = f"google-genai=={getattr(genai, '__version__', 'unknown')}"
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

    # 3. Failure handling: the parser and error-result helper must behave
    # safely for malformed input (a Gemini outage must never look verified).
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
        result["live_text_request"] = "SKIPPED: no API key"
        result["model_available"] = "SKIPPED: no API key"
        return result

    # 4. Client construction (no network).
    try:
        from app.services.ai.gemini import build_gemini_client

        client = build_gemini_client()
        result["client_initialization"] = "PASS"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] Gemini client init failed: %s", exc)
        result["client_initialization"] = f"FAIL: {_category(exc)}"
        return result

    if not live:
        result["live_text_request"] = "SKIPPED: add ?live=true"
        result["model_available"] = "SKIPPED: add ?live=true"
        return result

    # 5. Is the configured model actually served to this API key? This is the
    # check that would have caught the retired gemini-1.5-flash default.
    try:
        configured = settings.GEMINI_MODEL
        available = {
            str(getattr(model, "name", "")).split("/")[-1]
            for model in client.models.list()
        }
        result["model_available"] = (
            "PASS" if configured.split("/")[-1] in available else "FAIL: MODEL_NOT_FOUND"
        )
    except Exception as exc:  # noqa: BLE001
        result["model_available"] = f"FAIL: {_category(exc)}"

    # 6. Smallest possible live request: text only, a couple of tokens back.
    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents="Reply with exactly: OK",
        )
        text = (getattr(response, "text", "") or "").strip()
        result["live_text_request"] = "PASS" if text else "FAIL: EMPTY_RESPONSE"
    except Exception as exc:  # noqa: BLE001
        logger.warning("[AI DIAG] Gemini live request failed: %s", type(exc).__name__)
        result["live_text_request"] = f"FAIL: {_category(exc)}"

    return result


@router.get(
    "/diagnostic",
    summary="AI provider diagnostic (safe, credential-free)",
)
async def ai_diagnostic(
    live: Annotated[bool, Query(description="Also run live provider smoke tests")] = False,
) -> dict[str, Any]:
    """Return the health of the Groq and Gemini AI integrations.

    * No API keys or secrets are included.
    * Groq performs tiny bounded probes (short JSON intent, 1-candidate
      explanation, one conversational answer) so a broken config fails fast
      rather than hiding behind the deterministic fallback.
    * Gemini checks SDK presence, parsing, failure handling and client
      construction; with ``?live=true`` it also verifies that the configured
      model is served to this key and answers a minimal text request.
    """
    return {
        "groq": _groq_checks(live),
        "gemini": _gemini_checks(live),
        "live": live,
    }
