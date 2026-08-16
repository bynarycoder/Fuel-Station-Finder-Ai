"""
Tests for the Gemini image-verification service, covering:
* configuration gate (missing key -> AINotConfiguredError)
* malformed / empty responses -> safe zero-confidence result with error set
* SDK/network exceptions -> safe zero-confidence result (no crash)
* successful response parsing (score, is_plausible, summary, attributes)
"""

from __future__ import annotations

from typing import Any

import pytest

from app.core import config
from app.services.ai import gemini
from app.services.ai.base import AINotConfiguredError


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


def test_missing_sdk_returns_error_result(monkeypatch, _fake_genai_module) -> None:
    # Simulate google.generativeai not being installed by removing it from
    # sys.modules and raising ImportError from the lazy import.
    import sys, builtins

    monkeypatch.delitem(sys.modules, "google.generativeai", raising=False)
    real_import = builtins.__import__

    def _fake_import(name, *a, **kw):
        if name == "google.generativeai" or name.startswith("google.generativeai"):
            raise ImportError("no module named 'google.generativeai'")
        return real_import(name, *a, **kw)

    monkeypatch.setattr(builtins, "__import__", _fake_import)
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "x")
    result = gemini.analyze_queue_image(b"fake", "image/png")
    assert result.error == "SDK_NOT_INSTALLED"
    assert result.score == 0.0


@pytest.fixture
def _fake_genai_module(monkeypatch):
    """Patch google.generativeai with a fresh stub module per test so the
    service never hits the real network and tests don't leak state between
    them (Python caches imported modules in sys.modules, which can leave
    other tests — or diagnostic code — holding a reference to a stub)."""
    import sys, types

    saved = sys.modules.get("google.generativeai", None)
    saved_google = sys.modules.get("google", None)

    # Ensure a clean parent package namespace for the stub.
    google_pkg = types.ModuleType("google")
    google_pkg.__path__ = []
    monkeypatch.setitem(sys.modules, "google", google_pkg)

    fake_genai = types.ModuleType("google.generativeai")
    fake_genai.__version__ = "stub"
    monkeypatch.setitem(sys.modules, "google.generativeai", fake_genai)

    # Also clear any cached import in the gemini service module so the
    # lazy ``import google.generativeai as genai`` re-runs.
    monkeypatch.delattr(gemini, "genai", raising=False)

    yield fake_genai

    # Restore real modules (or absence) so later tests see the real SDK.
    sys.modules.pop("google.generativeai", None)
    if saved is not None:
        sys.modules["google.generativeai"] = saved
    if saved_google is not None:
        sys.modules["google"] = saved_google
    else:
        sys.modules.pop("google", None)


def test_provider_exception_returns_safe_error(monkeypatch, _fake_genai_module) -> None:
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "x")

    class _FakeModel:
        def generate_content(self, *a, **kw):
            raise RuntimeError("boom")

    _fake_genai_module.configure = staticmethod(lambda *a, **kw: None)
    _fake_genai_module.GenerativeModel = staticmethod(lambda *a, **kw: _FakeModel())

    result = gemini.analyze_queue_image(b"fake", "image/png")
    assert result.error == "PROVIDER_ERROR"
    assert result.is_plausible is False
    assert result.score == 0.0


def test_text_access_raises_returns_safe_error(monkeypatch, _fake_genai_module) -> None:
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "x")

    class _BadResp:
        @property
        def text(self):
            raise ValueError("blocked by safety")

    class _FakeModel:
        def generate_content(self, *a, **kw):
            return _BadResp()

    _fake_genai_module.configure = staticmethod(lambda *a, **kw: None)
    _fake_genai_module.GenerativeModel = staticmethod(lambda *a, **kw: _FakeModel())

    result = gemini.analyze_queue_image(b"fake", "image/png")
    assert result.error == "RESPONSE_INACCESSIBLE"


def test_successful_response_parsed(monkeypatch, _fake_genai_module) -> None:
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "x")

    class _Resp:
        text = (
            '{"score":0.92,"is_plausible":true,"summary":"Queue at NNPC",'
            '"detected_attributes":["fuel pumps","vehicles queueing"]}'
        )

    class _FakeModel:
        def generate_content(self, *a, **kw):
            return _Resp()

    _fake_genai_module.configure = staticmethod(lambda *a, **kw: None)
    _fake_genai_module.GenerativeModel = staticmethod(lambda *a, **kw: _FakeModel())

    result = gemini.analyze_queue_image(b"fake", "image/png")
    assert result.error is None
    assert result.score == pytest.approx(0.92)
    assert result.is_plausible is True
    assert result.summary == "Queue at NNPC"
    assert result.detected_attributes == ["fuel pumps", "vehicles queueing"]


def test_malformed_response_returns_malformed_error(monkeypatch, _fake_genai_module) -> None:
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "x")

    class _Resp:
        text = "hmm not really json sorry"

    class _FakeModel:
        def generate_content(self, *a, **kw):
            return _Resp()

    _fake_genai_module.configure = staticmethod(lambda *a, **kw: None)
    _fake_genai_module.GenerativeModel = staticmethod(lambda *a, **kw: _FakeModel())

    result = gemini.analyze_queue_image(b"fake", "image/png")
    assert result.error == "MALFORMED_RESPONSE"
    assert result.score == 0.0
