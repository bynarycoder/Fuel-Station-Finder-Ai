"""
Tests for the shared AI helper ``extract_json_object`` (robust LLM-output parsing).
"""

from __future__ import annotations

from app.services.ai.base import extract_json_object


def test_clean_json() -> None:
    assert extract_json_object('{"a": 1}') == {"a": 1}


def test_fenced_json() -> None:
    assert extract_json_object("```json\n{\"a\": 2}\n```") == {"a": 2}


def test_plain_fenced_json() -> None:
    assert extract_json_object("```\n{\"a\": 5}\n```") == {"a": 5}


def test_prose_then_json() -> None:
    assert extract_json_object('Here is the result: {"a": 3} done') == {"a": 3}


def test_invalid_returns_empty_dict() -> None:
    assert extract_json_object("no json here") == {}
    assert extract_json_object("") == {}
    assert extract_json_object(None) == {}


def test_non_object_returns_empty_dict() -> None:
    assert extract_json_object("[1, 2, 3]") == {}
