"""
Tests for the AI diagnostic endpoint.

These tests use mocked providers so they never touch the network. They confirm
that /api/v1/ai/diagnostic reports configuration and catches SDK-parameter
errors (the production max_retries regression) without exposing secrets.

These tests import the diagnostic helpers directly because the shared
``client`` fixture is async (httpx.AsyncClient) and the diagnostic endpoint is
a simple GET that doesn't need the database.
"""

from __future__ import annotations

import pytest

from app.core import config


def _fake_groq_working(monkeypatch: pytest.MonkeyPatch) -> None:
    class _OKCompletions:
        def create(self, **kwargs):
            if "max_retries" in kwargs:
                raise TypeError("unexpected kwarg max_retries")
            last_msg = str(kwargs["messages"][-1].get("content", ""))
            if "Explain" in last_msg:
                content = '{"answer":"Looks good."}'
            else:
                content = '{"fuel_type":"PMS","sort_preference":"price"}'
            msg = type("Msg", (), {"content": content})()
            choice = type("Choice", (), {"message": msg})()
            return type("Resp", (), {"choices": [choice]})()

    class _OKChat:
        completions = _OKCompletions()

    class _OKGroq:
        def __init__(self, *a, **kw):
            self.chat = _OKChat()

    monkeypatch.setattr("groq.Groq", _OKGroq)


def test_groq_diagnostic_reports_fallback_and_skips_live_when_no_key(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "GROQ_API_KEY", "")
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "")

    from app.api.v1 import ai_diag

    groq_result = ai_diag._groq_checks(live=False)
    gemini_result = ai_diag._gemini_checks(live=False)
    assert groq_result["api_key_configured"] is False
    assert groq_result["fallback"] == "PASS"
    assert groq_result["intent_parsing"].startswith("SKIPPED")
    assert gemini_result["api_key_configured"] is False


def test_groq_diagnostic_detects_sdk_parameter_error(monkeypatch) -> None:
    """If the Groq call raises TypeError (e.g. an unexpected kwarg), diagnostic categorises it."""
    monkeypatch.setattr(config.settings, "GROQ_API_KEY", "x")
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "")

    class _BoomCompletions:
        def create(self, **kwargs):
            raise TypeError("Completions.create() got an unexpected keyword argument 'bogus'")

    class _BoomChat:
        completions = _BoomCompletions()

    class _BoomGroq:
        def __init__(self, *a, **kw):
            self.chat = _BoomChat()

    monkeypatch.setattr("groq.Groq", _BoomGroq)

    from app.api.v1 import ai_diag

    result = ai_diag._groq_checks(live=False)
    assert result["client_initialization"] == "PASS"
    assert result["intent_parsing"].startswith("FAIL")
    assert "SDK_PARAMETER_ERROR" in result["intent_parsing"]


def test_groq_diagnostic_passes_when_groq_healthy(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "GROQ_API_KEY", "x")
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "")
    _fake_groq_working(monkeypatch)

    from app.api.v1 import ai_diag

    result = ai_diag._groq_checks(live=False)
    assert result["client_initialization"] == "PASS"
    assert result["intent_parsing"] == "PASS"
    assert result["explanation_generation"] == "PASS"
    assert result["conversation"] == "PASS"
    assert result["router"] == "PASS"
    # The live smoke test is opt-in so a ping never bills the provider.
    assert result["smoke_test"].startswith("SKIPPED")


def test_groq_diagnostic_live_smoke_test_requires_verbatim_token(monkeypatch) -> None:
    """?live=true proves the answer came from the model, not from a fallback."""
    monkeypatch.setattr(config.settings, "GROQ_API_KEY", "x")
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "")
    _fake_groq_working(monkeypatch)

    from app.api.v1 import ai_diag

    result = ai_diag._groq_checks(live=True)
    # The fake echoes JSON, not the token -> the check must FAIL rather than
    # optimistically report success.
    assert result["smoke_test"].startswith("FAIL")


def test_groq_diagnostic_never_exposes_secrets(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "GROQ_API_KEY", "super-secret-key")
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "another-secret")
    _fake_groq_working(monkeypatch)

    from app.api.v1 import ai_diag

    payload = repr(ai_diag._groq_checks(live=False)) + repr(
        ai_diag._gemini_checks(live=False)
    )
    assert "super-secret-key" not in payload
    assert "another-secret" not in payload


def test_gemini_diagnostic_reports_parser_and_failure_handling(monkeypatch) -> None:
    # failure_handling calls analyze_queue_image with empty bytes, which needs
    # a key set (empty-key path raises AINotConfiguredError before reaching
    # the empty-bytes check).
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "x")
    from app.api.v1 import ai_diag

    result = ai_diag._gemini_checks(live=False)
    assert result["sdk"].startswith("google-genai==")  # the supported SDK
    assert result["response_parsing"] == "PASS"
    assert result["failure_handling"] == "PASS"
