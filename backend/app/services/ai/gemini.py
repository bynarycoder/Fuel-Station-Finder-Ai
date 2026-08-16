"""
Gemini-powered verification of crowd-sourced queue/station photos (Phase 8).

Given an uploaded report image, Gemini assesses whether it plausibly depicts a
Nigerian fuel station / fuel queue and returns a validation *score* plus a short
rationale. The prompt and response parsing are split from the network call so the
deterministic parts are unit-testable without an API key.

Network/SDK errors are caught inside the service and mapped to a safe
low-confidence result (never raised) so a transient Gemini outage cannot 500 the
verify endpoint or silently mark a report as verified. Only a missing API key
raises AINotConfiguredError so operators can distinguish "not configured" from
"temporarily failing".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings
from app.services.ai.base import AINotConfiguredError, extract_json_object

logger = logging.getLogger(__name__)

# Reports scoring at/above this are auto-promoted to "verified".
VERIFICATION_THRESHOLD = 0.7

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

    try:
        # Imported lazily so the (deprecated) SDK is only loaded when actually used,
        # and so importing this module never requires the SDK at startup.
        import google.generativeai as genai
    except ImportError as exc:  # pragma: no cover - environment error
        return _error_result("SDK_NOT_INSTALLED", log_detail=f"google-generativeai import failed: {exc}")

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(settings.GEMINI_MODEL)
        response = model.generate_content(
            [
                build_verification_prompt(),
                {"mime_type": mime_type, "data": image_bytes},
            ],
            request_options={"timeout": settings.AI_TIMEOUT_SECONDS},
        )
    except Exception as exc:  # network, timeout, auth, SDK, etc.
        return _error_result("PROVIDER_ERROR", log_detail=f"{type(exc).__name__}: {exc}")

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
