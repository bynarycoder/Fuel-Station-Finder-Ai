"""
Tests for the Gemini verification service (Phase 8) — prompt + response parsing
and the config gate, all without an API key (the deterministic parts).
"""

from __future__ import annotations

import pytest

from app.core import config
from app.services.ai import gemini
from app.services.ai.base import AINotConfiguredError


def test_prompt_requests_structured_json() -> None:
    prompt = gemini.build_verification_prompt()
    assert "JSON" in prompt
    assert "score" in prompt
    assert "is_plausible" in prompt


def test_parse_clean_json() -> None:
    result = gemini.parse_verification_response(
        '{"score": 0.9, "is_plausible": true, "summary": "Queue at NNPC", '
        '"detected_attributes": ["fuel pumps", "vehicles queueing"]}'
    )
    assert result.score == 0.9
    assert result.is_plausible is True
    assert result.summary == "Queue at NNPC"
    assert result.detected_attributes == ["fuel pumps", "vehicles queueing"]


def test_parse_fenced_json_infers_plausibility_from_score() -> None:
    result = gemini.parse_verification_response('```json\n{"score": 0.4, "summary": "x"}\n```')
    assert result.score == 0.4
    assert result.is_plausible is False  # below 0.5 default


def test_parse_clamps_out_of_range_scores() -> None:
    assert gemini.parse_verification_response('{"score": 5}').score == 1.0
    assert gemini.parse_verification_response('{"score": -3}').score == 0.0


def test_parse_malformed_response_returns_safe_defaults() -> None:
    result = gemini.parse_verification_response("the model rambled with no json")
    assert result.score == 0.0
    assert result.is_plausible is False
    assert result.detected_attributes == []


def test_parse_none_response() -> None:
    result = gemini.parse_verification_response(None)
    assert result.score == 0.0


def test_analyze_requires_configured_key(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "GEMINI_API_KEY", "")
    with pytest.raises(AINotConfiguredError):
        gemini.analyze_queue_image(b"data", "image/png")
