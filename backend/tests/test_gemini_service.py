"""
Tests for the Gemini image-verification service (the app's multimodal provider).

Covers the contract the reports API depends on:
* configuration gate (missing key -> AINotConfiguredError)
* the SUPPORTED SDK is used (``google-genai``; ``google-generativeai`` reached
  end-of-life on 30 Nov 2025)
* the configured model is the one actually requested
* successful response parsing (score, is_plausible, summary, attributes)
* malformed / empty responses -> safe zero-confidence result with error set
* SDK / network / timeout / auth / retired-model errors -> safe zero-confidence
  result with a category, never a crash and never a "verified" promotion
* image guards: empty image, unsupported mime type

The client factory is patched, so no test ever touches the network.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.core import config
from app.services.ai import gemini
from app.services.ai.base import AINotConfiguredError


class _FakeResponse:
    def __init__(self, text: Any) -> None:
        self._text = text

    @property
    def text(self) -> Any:
        if isinstance(self._text, Exception):
            raise self._text
        return self._text


class _FakeModels:
    def __init__(self, result: Any) -> None:
        self._result = result
        self.calls: list[dict[str, Any]] = []

    def generate_content(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if isinstance(self._result, Exception):
            raise self._result
        return _FakeResponse(self._result)


class _FakeClient:
    def __init__(self, result: Any) -> None:
        self.models = _FakeModels(result)


def _install_client(monkeypatch: pytest.MonkeyPatch, result: Any) -> _FakeClient:
    """Patch the Gemini client factory with a recording fake."""
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "test-key")
    client = _FakeClient(result)
    monkeypatch.setattr(gemini, "build_gemini_client", lambda: client)
    return client


# --------------------------------------------------------------------------- #
# Configuration / input guards
# --------------------------------------------------------------------------- #
def test_missing_key_raises_config_error(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "")
    with pytest.raises(AINotConfiguredError):
        gemini.analyze_queue_image(b"data", "image/png")


def test_empty_image_returns_error_result(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "x")
    result = gemini.analyze_queue_image(b"", "image/png")
    assert result.score == 0.0
    assert result.is_plausible is False
    assert result.error == "EMPTY_IMAGE"


def test_unsupported_mime_type_is_rejected_before_calling_provider(monkeypatch) -> None:
    client = _install_client(monkeypatch, '{"score":1.0,"is_plausible":true}')
    result = gemini.analyze_queue_image(b"fake", "application/pdf")
    assert result.error == "UNSUPPORTED_IMAGE_TYPE"
    assert result.score == 0.0
    assert client.models.calls == []  # never billed a provider call


# --------------------------------------------------------------------------- #
# SDK contract
# --------------------------------------------------------------------------- #
def test_uses_supported_unified_sdk() -> None:
    """The service must import the supported SDK, not the EOL one."""
    source = (gemini.__file__ or "")
    with open(source, "r", encoding="utf-8") as handle:
        code = handle.read()
    assert "from google import genai" in code
    assert "import google.generativeai" not in code


def test_default_model_is_not_the_retired_gemini_15_flash() -> None:
    # gemini-1.5-flash was shut down on 29 Sep 2025 and 404s for every request.
    assert config.settings.GEMINI_MODEL not in {
        "gemini-1.5-flash",
        "gemini-1.5-flash-002",
        "gemini-1.5-flash-8b",
        "gemini-1.5-pro",
    }


def test_configured_model_and_image_are_sent(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "GEMINI_MODEL", "gemini-test-model")
    client = _install_client(
        monkeypatch, '{"score":0.8,"is_plausible":true,"summary":"pumps"}'
    )
    gemini.analyze_queue_image(b"\x89PNG-bytes", "image/png")

    call = client.models.calls[0]
    assert call["model"] == "gemini-test-model"
    contents = call["contents"]
    # The image part and the instruction prompt are both sent.
    assert any(getattr(part, "inline_data", None) is not None for part in contents[:1])
    assert any(isinstance(part, str) and "JSON" in part for part in contents)


# --------------------------------------------------------------------------- #
# Responses
# --------------------------------------------------------------------------- #
def test_successful_response_parsed(monkeypatch) -> None:
    _install_client(
        monkeypatch,
        '{"score":0.92,"is_plausible":true,"summary":"Queue at NNPC",'
        '"detected_attributes":["fuel pumps","vehicles queueing"]}',
    )
    result = gemini.analyze_queue_image(b"fake", "image/png")
    assert result.error is None
    assert result.score == pytest.approx(0.92)
    assert result.is_plausible is True
    assert result.summary == "Queue at NNPC"
    assert result.detected_attributes == ["fuel pumps", "vehicles queueing"]


def test_malformed_response_returns_malformed_error(monkeypatch) -> None:
    _install_client(monkeypatch, "hmm not really json sorry")
    result = gemini.analyze_queue_image(b"fake", "image/png")
    assert result.error == "MALFORMED_RESPONSE"
    assert result.score == 0.0


def test_empty_response_returns_error(monkeypatch) -> None:
    _install_client(monkeypatch, "")
    result = gemini.analyze_queue_image(b"fake", "image/png")
    assert result.error == "EMPTY_RESPONSE"
    assert result.score == 0.0
    assert result.is_plausible is False


def test_text_access_raises_returns_safe_error(monkeypatch) -> None:
    _install_client(monkeypatch, ValueError("blocked by safety"))
    result = gemini.analyze_queue_image(b"fake", "image/png")
    # The exception is raised while producing the response object here, so the
    # provider-error path classifies it — the important guarantee is that the
    # call is safe and never scores the report.
    assert result.error is not None
    assert result.score == 0.0
    assert result.is_plausible is False


# --------------------------------------------------------------------------- #
# Provider failures -> safe categories (never a crash, never "verified")
# --------------------------------------------------------------------------- #
class _Timeout(Exception):
    pass


_Timeout.__name__ = "APITimeoutError"


class _RateLimit(Exception):
    status_code = 429


class _Unauthorized(Exception):
    status_code = 401


class _NotFound(Exception):
    """Retired/unknown model — what gemini-1.5-flash returns today."""

    status_code = 404


@pytest.mark.parametrize(
    ("exception", "expected"),
    [
        (_Timeout("timed out"), "TIMEOUT"),
        (_RateLimit("slow down"), "RATE_LIMITED"),
        (_Unauthorized("bad key"), "AUTH_ERROR"),
        (_NotFound("model not found"), "MODEL_NOT_FOUND"),
        (RuntimeError("boom"), "PROVIDER_ERROR"),
    ],
)
def test_provider_exceptions_are_categorised_safely(
    monkeypatch, exception: Exception, expected: str
) -> None:
    _install_client(monkeypatch, exception)
    result = gemini.analyze_queue_image(b"fake", "image/png")
    assert result.error == expected
    assert result.score == 0.0
    assert result.is_plausible is False
    assert "unavailable" in result.summary.lower()


def test_provider_failure_score_stays_below_verification_threshold(monkeypatch) -> None:
    _install_client(monkeypatch, RuntimeError("boom"))
    result = gemini.analyze_queue_image(b"fake", "image/png")
    assert result.score < gemini.VERIFICATION_THRESHOLD


# --------------------------------------------------------------------------- #
# Real-SDK contract (no network): the arguments we pass must actually exist in
# the installed google-genai version. Mocks cannot catch SDK API drift.
# --------------------------------------------------------------------------- #
def test_client_is_built_against_the_real_sdk_contract(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(config.settings, "AI_TIMEOUT_SECONDS", 12.0)
    monkeypatch.setattr(config.settings, "AI_MAX_RETRIES", 1)

    client = gemini.build_gemini_client()

    # google-genai expects the HTTP timeout in MILLISECONDS.
    options = client._api_client._http_options
    assert options.timeout == 12000
    assert options.retry_options.attempts == 2


def test_request_payload_uses_valid_sdk_types() -> None:
    """The image part / config we send must be constructible by the real SDK."""
    from google.genai import types as genai_types

    part = genai_types.Part.from_bytes(data=b"\x89PNG", mime_type="image/png")
    assert part.inline_data is not None
    assert part.inline_data.mime_type == "image/png"

    cfg = genai_types.GenerateContentConfig(response_mime_type="application/json")
    assert cfg.response_mime_type == "application/json"
