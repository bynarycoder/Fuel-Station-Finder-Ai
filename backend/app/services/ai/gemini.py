"""
Gemini-powered verification of crowd-sourced report photos.

Responsibility (unchanged from the original design): given the image a user
attached to a fuel report, Gemini judges whether it plausibly depicts a
Nigerian filling station / fuel queue and returns

    score, is_plausible, summary, detected_attributes

which the reports API maps to ``VerificationResultPublic`` and persists as the
report's ``ai_confidence_score`` (auto-promoting to ``verified`` at/above
``VERIFICATION_THRESHOLD``). Gemini is the app's *multimodal* provider; Groq is
never used here, and Gemini is never used for conversation or recommendations.

Two production faults fixed here (2026 audit):

1. ``google-generativeai`` reached end-of-life on 30 Nov 2025. The call now
   uses the supported unified SDK, ``google-genai`` (``from google import
   genai``).
2. ``gemini-1.5-flash`` was **shut down on 29 Sep 2025** and returns 404 for
   every request, so verification could never have succeeded in production
   even though the API key was configured and the diagnostic reported "PASS"
   (it only constructed a client, it never called the API). The default model
   is now a currently-supported multimodal Flash model, overridable via
   ``GEMINI_MODEL``.

Failure policy (unchanged): only a missing API key raises
``AINotConfiguredError``; every SDK/network/parse failure returns a
zero-confidence ``VerificationResult`` with a safe ``error`` category, so a
provider outage can never crash the endpoint and can never promote a report to
"verified".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings
from app.services.ai.base import AINotConfiguredError, extract_json_object
from app.services.ai.provider import classify_provider_error, log_provider_failure

logger = logging.getLogger(__name__)

# Reports scoring at/above this are auto-promoted to "verified".
VERIFICATION_THRESHOLD = 0.7

# Gemini image inputs the API accepts for this feature (mirrors the upload
# validation in ``app.services.storage``).
SUPPORTED_IMAGE_MIME_TYPES = ("image/jpeg", "image/png", "image/webp")

_VERIFICATION_PROMPT = """\
You are a moderator for a Nigerian fuel-station crowd-reporting app. You are \
given a photo that a user attached to a fuel report. Decide whether it plausibly \
depicts a real Nigerian filling station and/or a fuel queue.

Respond with STRICT JSON only (no markdown, no prose) using exactly this shape:
{
  "score": <float between 0.0 and 1.0; confidence the photo is genuine/relevant>,
  "is_plausible": <boolean>,
  "summary": "<one short sentence describing what you see>",
  "detected_attributes": ["<e.g. fuel pumps", "vehicles queueing", "NNPC branding>"]
}
If the image is unrelated, blurry, or looks fake, give a low score and set \
is_plausible to false.
"""


class GeminiVerificationError(RuntimeError):
    """Raised for Gemini SDK/network/timeout errors that the caller may handle.

    The verify endpoint maps this to HTTP 503 rather than letting it propagate
    as an unhandled 500.
    """


@dataclass
class VerificationResult:
    score: float
    is_plausible: bool
    summary: str
    detected_attributes: list[str] = field(default_factory=list)
    error: str | None = None  # populated when Gemini failed; safe for logging


def build_verification_prompt() -> str:
    """The instruction prompt sent to Gemini alongside the image."""
    return _VERIFICATION_PROMPT


def _clamp_score(value: Any) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, score))


def parse_verification_response(text: str | None) -> VerificationResult:
    """Map a Gemini text response to a ``VerificationResult`` (pure)."""
    data = extract_json_object(text)
    score = _clamp_score(data.get("score", 0.0))
    return VerificationResult(
        score=score,
        is_plausible=bool(data.get("is_plausible", score >= 0.5)),
        summary=str(data.get("summary", ""))[:500],
        detected_attributes=[
            str(item) for item in data.get("detected_attributes", [])
        ][:20],
    )


def _error_result(reason: str, *, log_detail: str | None = None) -> VerificationResult:
    """Return a safe zero-confidence result and log a warning.

    Used when Gemini cannot be reached or returns something unusable. The
    report stays pending (score 0 < threshold) for manual review.
    """
    if log_detail:
        logger.warning("[GEMINI] verification failed: %s", log_detail)
    return VerificationResult(
        score=0.0,
        is_plausible=False,
        summary="AI verification is currently unavailable; report held for manual review.",
        detected_attributes=[],
        error=reason,
    )


def _timeout_millis() -> int:
    """Per-request timeout in milliseconds (the unified SDK's unit)."""
    return max(1, int(settings.AI_TIMEOUT_SECONDS * 1000))


def build_gemini_client() -> Any:
    """Construct the unified Gemini client with a bounded HTTP timeout.

    Raises ``AINotConfiguredError`` when ``GEMINI_API_KEY`` is empty and
    ``ImportError`` when the SDK is not installed (callers map both to a safe
    outcome). The key is only ever passed to the SDK — never logged.
    """
    if not settings.GEMINI_API_KEY:
        raise AINotConfiguredError(
            "Gemini verification is not configured (GEMINI_API_KEY is missing)."
        )

    # Imported lazily so importing this module never requires the SDK.
    from google import genai
    from google.genai import types as genai_types

    return genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options=genai_types.HttpOptions(
            timeout=_timeout_millis(),
            # SDK-level retries for transient errors are bounded; the total
            # wall-clock cost stays timeout * (retries + 1).
            retry_options=genai_types.HttpRetryOptions(
                attempts=settings.AI_MAX_RETRIES + 1
            ),
        ),
    )


def analyze_queue_image(image_bytes: bytes, mime_type: str) -> VerificationResult:
    """Send the image to Gemini and return its verification assessment.

    Raises ``AINotConfiguredError`` when ``GEMINI_API_KEY`` is not set (so the
    operator can see a clear 503). SDK/network/timeout errors are caught and
    returned as a low-confidence ``VerificationResult`` with ``error`` set,
    so a Gemini outage never crashes the verify endpoint and never falsely
    promotes a report to "verified".
    """
    if not settings.GEMINI_API_KEY:
        raise AINotConfiguredError(
            "Gemini verification is not configured (GEMINI_API_KEY is missing)."
        )

    if not image_bytes:
        return _error_result("EMPTY_IMAGE", log_detail="empty image bytes passed to analyzer")

    normalised_mime = (mime_type or "").lower().strip()
    if normalised_mime not in SUPPORTED_IMAGE_MIME_TYPES:
        return _error_result(
            "UNSUPPORTED_IMAGE_TYPE",
            log_detail=f"unsupported mime type for verification: {normalised_mime!r}",
        )

    model = settings.GEMINI_MODEL
    try:
        from google.genai import types as genai_types

        client = build_gemini_client()
        response = client.models.generate_content(
            model=model,
            contents=[
                genai_types.Part.from_bytes(data=image_bytes, mime_type=normalised_mime),
                build_verification_prompt(),
            ],
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
    except ImportError as exc:  # pragma: no cover - environment error
        return _error_result(
            "SDK_NOT_INSTALLED", log_detail=f"google-genai import failed: {exc}"
        )
    except Exception as exc:  # network, timeout, auth, retired model, SDK, etc.
        category, status = classify_provider_error(exc)
        log_provider_failure(
            provider="gemini",
            feature="report_photo_verification",
            model=model,
            category=category,
            status_code=status,
        )
        return _error_result(category, log_detail=f"{type(exc).__name__}")

    # Gemini can return a response object where .text raises (e.g. safety
    # blocks). Surface that as a safe failure instead of crashing.
    try:
        text = getattr(response, "text", None)
    except Exception as exc:  # pragma: no cover - depends on SDK internals
        return _error_result("RESPONSE_INACCESSIBLE", log_detail=f"{type(exc).__name__}: {exc}")

    if not text:
        return _error_result("EMPTY_RESPONSE", log_detail="Gemini returned no text content")

    result = parse_verification_response(text)
    if not result.summary and not result.detected_attributes and result.score == 0.0:
        # Parser fell through to defaults -> response wasn't usable JSON.
        return _error_result("MALFORMED_RESPONSE", log_detail=f"could not parse JSON from: {text[:200]!r}")
    return result
