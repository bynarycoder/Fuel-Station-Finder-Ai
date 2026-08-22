"""
Tests for the Groq natural-language search service (Phase 8) — prompt + query
normalisation and the config gate, without an API key.
"""

from __future__ import annotations

import pytest

from app.core import config
from app.models import QueueLength
from app.services.ai import nl_search
from app.services.ai.base import AINotConfiguredError


def test_system_prompt_lists_all_fields() -> None:
    prompt = nl_search.build_system_prompt()
    for field in ("fuel_type", "queue_length", "brand", "city", "state"):
        assert field in prompt


def test_to_parsed_query_normalises_values() -> None:
    parsed = nl_search.to_parsed_query(
        {"fuel_type": "pms", "queue_length": "Short", "brand": " nnpc ", "city": "Ikeja"},
        "short petrol near ikeja",
    )
    assert parsed.fuel_type == "PMS"
    assert parsed.queue_length == QueueLength.SHORT
    assert parsed.brand == "nnpc"
    assert parsed.city == "Ikeja"
    assert parsed.raw == "short petrol near ikeja"


def test_to_parsed_query_drops_unknown_enums() -> None:
    parsed = nl_search.to_parsed_query(
        {"fuel_type": "XYZ", "queue_length": "huge"}, ""
    )
    assert parsed.fuel_type is None
    assert parsed.queue_length is None


def test_to_parsed_query_handles_empty_input() -> None:
    parsed = nl_search.to_parsed_query({}, "")
    assert parsed.fuel_type is None
    assert parsed.brand is None
    assert parsed.queue_length is None


def test_to_parsed_query_preserves_all_products() -> None:
    for code in ("PMS", "AGO", "DPK", "LPG"):
        assert nl_search.to_parsed_query({"fuel_type": code}, "").fuel_type == code


def test_parse_requires_configured_key(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "GROQ_API_KEY", "")
    with pytest.raises(AINotConfiguredError):
        nl_search.parse_natural_query("short petrol near ikeja")
