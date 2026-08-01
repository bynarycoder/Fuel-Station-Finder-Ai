"""
Gemini-powered verification of crowd-sourced queue/station photos (Phase 8).

Given an uploaded report image, Gemini assesses whether it plausibly depicts a
Nigerian fuel station / fuel queue and returns a validation *score* plus a short
rationale. The prompt and response parsing are split from the network call so the
deterministic parts are unit-testable without an API key.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.config import settings
from app.services.ai.base import AINotConfiguredError, extract_json_object

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


@dataclass
class VerificationResult:
    score: float
    is_plausible: bool
    summary: str
    detected_attributes: list[str] = field(default_factory=list)


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


def analyze_queue_image(image_bytes: bytes, mime_type: str) -> VerificationResult:
    """Send the image to Gemini and return its verification assessment.

    Raises ``AINotConfiguredError`` when ``GEMINI_API_KEY`` is not set.
    """
    if not settings.GEMINI_API_KEY:
        raise AINotConfiguredError(
            "Gemini verification is not configured (GEMINI_API_KEY is missing)."
        )

    # Imported lazily so the (deprecated) SDK is only loaded when actually used,
    # and so importing this module never requires the SDK at startup.
    import google.generativeai as genai

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(settings.GEMINI_MODEL)
    response = model.generate_content(
        [
            build_verification_prompt(),
            {"mime_type": mime_type, "data": image_bytes},
        ]
    )
    return parse_verification_response(getattr(response, "text", None))
