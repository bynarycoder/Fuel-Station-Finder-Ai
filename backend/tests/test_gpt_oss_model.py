"""
GPT-OSS 20B compatibility regression tests (Groq Fuel AI migration).

The Groq provider was migrated from ``llama-3.3-70b-versatile`` /
``llama-3.1-8b-instant`` to ``openai/gpt-oss-20b``. These tests pin down the
GPT-OSS 20B contract the application relies on:

* the default ``GROQ_MODEL`` configuration is ``openai/gpt-oss-20b``;
* an explicit ``GROQ_MODEL`` environment override still resolves;
* intent extraction and explanation both call the Groq chat/completions endpoint
  with the configured model and ``response_format={"type": "json_object"}``
  (JSON mode), and validate the output through the Pydantic schemas;
* malformed/empty JSON degrades to the deterministic fallback instead of erroring;
* provider timeout / missing key degrade to the deterministic fallback.

The Groq client is mocked here so the normal unit suite never depends on a live
API key. A clearly-marked live integration smoke test (``test_gpt_oss_live``) is
included and is skipped unless ``GROQ_API_KEY`` is set.
"""

from __future__ import annotations

import os
from typing import Any

import pytest

from app.core import config
from app.models import FuelTypeCode
from app.services.ai import nl_search, recommend
from app.services.ai.base import AINotConfiguredError, extract_json_object

NEW_MODEL = "openai/gpt-oss-20b"
OLD_MODEL_70B = "llama-3.3-70b-versatile"
OLD_MODEL_8B = "llama-3.1-8b-instant"


# --------------------------------------------------------------------------- #
# Fake Groq client (records every chat.completions.create call and client
# construction kwargs so tests can assert that max_retries lives on the client,
# not on the per-request create() call).
# --------------------------------------------------------------------------- #
def install_fake_groq(monkeypatch: pytest.MonkeyPatch, content: str):
    """Replace the lazily-imported ``groq.Groq`` with a recording fake.

    Returns a tuple ``(client_calls, create_calls)`` where ``client_calls``
    collects constructor kwargs (api_key, timeout, max_retries, ...) and
    ``create_calls`` collects per-request kwargs (model, messages, ...).
    """
    client_calls: list[dict[str, Any]] = []
    create_calls: list[dict[str, Any]] = []

    class _FakeCompletions:
        def create(self, **kwargs: Any) -> Any:
            create_calls.append(kwargs)
            return _make_response()

    class _FakeChat:
        completions = _FakeCompletions()

    class _FakeGroq:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            client_calls.append(kwargs)
            self.chat = _FakeChat()

    def _make_response() -> Any:
        message = type("Message", (), {"content": content})()
        choice = type("Choice", (), {"message": message})()
        return type("Response", (), {"choices": [choice]})()

    monkeypatch.setattr("groq.Groq", _FakeGroq)
    return client_calls, create_calls


def _set_key(monkeypatch: pytest.MonkeyPatch, key: str = "test-groq-key") -> None:
    monkeypatch.setattr(config.settings, "GROQ_API_KEY", key)


# --------------------------------------------------------------------------- #
# 1. Model configuration
# --------------------------------------------------------------------------- #
class TestModelConfiguration:
    def test_default_model_is_gpt_oss_20b(self) -> None:
        assert config.settings.GROQ_MODEL == NEW_MODEL

    def test_default_is_not_any_old_llama(self) -> None:
        assert config.settings.GROQ_MODEL != OLD_MODEL_70B
        assert config.settings.GROQ_MODEL != OLD_MODEL_8B

    def test_env_override_still_resolves(self, monkeypatch) -> None:
        # A fresh Settings instance reads the GROQ_MODEL env var. Assert the
        # requested value is honoured end-to-end.
        monkeypatch.setenv("GROQ_MODEL", NEW_MODEL)
        assert config.Settings(_env_file=None).GROQ_MODEL == NEW_MODEL

    def test_env_override_can_select_alternative_model(self, monkeypatch) -> None:
        # An explicit env override of a different model still resolves too.
        monkeypatch.setenv("GROQ_MODEL", NEW_MODEL)
        assert config.Settings(_env_file=None).GROQ_MODEL == NEW_MODEL


# --------------------------------------------------------------------------- #
# 2. Intent extraction (GPT-OSS 20B path)
# --------------------------------------------------------------------------- #
class TestIntentExtraction:
    def test_intent_uses_configured_model_and_json_mode(self, monkeypatch) -> None:
        _set_key(monkeypatch)
        client_calls, create_calls = install_fake_groq(
            monkeypatch,
            '{"fuel_type":"PMS","sort_preference":"price","require_verified":false}',
        )
        intent = recommend.parse_recommend_intent("Find the cheapest petrol near me")

        assert client_calls, "expected a Groq() client construction"
        assert create_calls, "expected a Groq chat.completions.create call"
        init_kwargs = client_calls[0]
        call = create_calls[0]
        assert call["model"] == NEW_MODEL
        assert call["response_format"] == {"type": "json_object"}
        # max_retries MUST live on the client, NOT on create() — this is the
        # production regression (TypeError) we're guarding against.
        assert init_kwargs["max_retries"] == config.settings.AI_MAX_RETRIES
        assert init_kwargs["timeout"] == config.settings.AI_TIMEOUT_SECONDS
        assert "max_retries" not in call, "max_retries is not a valid create() kwarg"

        # Output validated/normalised by the pure mapping layer.
        assert intent.fuel_type == "PMS"
        assert intent.sort_preference == "price"
        assert intent.require_verified is False

    def test_intent_json_is_parsed_and_validated(self, monkeypatch) -> None:
        _set_key(monkeypatch)
        install_fake_groq(
            monkeypatch,
            '{"fuel_type":"AGO","max_price":1000,"sort_preference":"price"}',
        )
        intent = recommend.parse_recommend_intent("diesel under ₦1000")
        assert intent.fuel_type == "AGO"
        assert intent.max_price == 1000
        assert intent.sort_preference == "price"

    def test_intent_malformed_json_degrades_in_extract(self, monkeypatch) -> None:
        # A non-JSON Groq reply cannot be parsed. The pure validation layer
        # (to_fuel_intent) drops every field to "unspecified" — it never 500s
        # and never invents fuel/price facts the user did not state.
        _set_key(monkeypatch)
        install_fake_groq(monkeypatch, "this is not json")
        intent, source = recommend.extract_intent("Find the cheapest petrol near me")
        assert source == "groq"  # the model responded; no exception propagated
        assert intent.fuel_type is None
        assert intent.max_price is None
        assert intent.sort_preference is None


# --------------------------------------------------------------------------- #
# 3. Explanation generation (GPT-OSS 20B path)
# --------------------------------------------------------------------------- #
class TestExplanationGeneration:
    def _ranked(self, monkeypatch):
        station = {
            "id": "test-id",
            "name": "Cheap Co",
            "brand": None,
            "city": "Lagos",
            "state": "Lagos",
            "phone": None,
            "latitude": 6.52,
            "longitude": 3.38,
            "is_active": True,
            "data_source": "seed",
            "verification_status": "unverified",
            "verified_at": None,
            "last_verified_at": None,
            "source_id": None,
            "fuel_types": [{"code": "PMS", "name": "Petrol (PMS)"}],
            "created_at": None,
            "updated_at": None,
            "distance_meters": 500.0,
        }
        intent = recommend.FuelSearchIntent(
            fuel_type="PMS", sort_preference="price", raw="cheapest petrol"
        )
        price_map = {"test-id": [{"fuel_type_code": "PMS", "price_per_litre": 850.0, "status": "verified", "created_at": None}]}
        ranked = recommend.rank_recommendations([station], intent, price_map)
        return intent, ranked

    def test_explanation_uses_configured_model_and_json_mode(self, monkeypatch) -> None:
        _set_key(monkeypatch)
        intent, ranked = self._ranked(monkeypatch)
        client_calls, create_calls = install_fake_groq(
            monkeypatch, '{"answer":"Cheap Co is the lowest-priced nearby option."}'
        )
        answer = recommend.generate_explanation(intent, ranked)

        call = create_calls[0]
        init_kwargs = client_calls[0]
        assert call["model"] == NEW_MODEL
        assert call["response_format"] == {"type": "json_object"}
        assert init_kwargs["max_retries"] == config.settings.AI_MAX_RETRIES
        assert init_kwargs["timeout"] == config.settings.AI_TIMEOUT_SECONDS
        assert "max_retries" not in call
        assert "Cheap Co" in answer
        # The facts-only prompt forbids inventing prices/verification.
        prompt = call["messages"][0]["content"]
        assert "never invent" in prompt.lower()

    def test_explanation_empty_output_falls_back_to_template(self, monkeypatch) -> None:
        _set_key(monkeypatch)
        intent, ranked = self._ranked(monkeypatch)
        install_fake_groq(monkeypatch, "not valid json at all")
        answer = recommend.generate_explanation(intent, ranked)
        # Degrades to the deterministic, facts-based template — never errors.
        assert isinstance(answer, str) and answer


# --------------------------------------------------------------------------- #
# 4. Fallback & timeout behaviour (unchanged for GPT-OSS 20B)
# --------------------------------------------------------------------------- #
class TestFallbackAndTimeout:
    def test_missing_api_key_degrades_to_fallback(self, monkeypatch) -> None:
        _set_key(monkeypatch, key="")
        intent, source = recommend.extract_intent("closest CNG station")
        assert source == "fallback"
        assert intent.fuel_type == "CNG"
        assert intent.sort_preference == "distance"

    def test_provider_timeout_degrades_to_fallback(self, monkeypatch) -> None:
        _set_key(monkeypatch)

        def _timeout(*args, **kwargs):
            raise TimeoutError("AI provider timed out")

        monkeypatch.setattr(recommend, "parse_recommend_intent", _timeout)
        intent, source = recommend.extract_intent("closest petrol")
        assert source == "fallback"
        assert intent.fuel_type == "PMS"
        assert intent.sort_preference == "distance"

    def test_nl_search_gate_requires_key(self, monkeypatch) -> None:
        _set_key(monkeypatch, key="")
        with pytest.raises(AINotConfiguredError):
            nl_search.parse_natural_query("short petrol near Ikeja")

    def test_nl_search_uses_configured_model_and_json_mode(self, monkeypatch) -> None:
        _set_key(monkeypatch)
        client_calls, create_calls = install_fake_groq(
            monkeypatch, '{"fuel_type":"PMS","queue_length":null,"brand":null,"city":"Ikeja","state":null}'
        )
        parsed = nl_search.parse_natural_query("short petrol near Ikeja")
        assert create_calls[0]["model"] == NEW_MODEL
        assert create_calls[0]["response_format"] == {"type": "json_object"}
        assert client_calls[0]["max_retries"] == config.settings.AI_MAX_RETRIES
        assert "max_retries" not in create_calls[0]
        assert parsed.fuel_type == "PMS"
        assert parsed.city == "Ikeja"


# --------------------------------------------------------------------------- #
# 5. Live integration smoke test (skipped unless GROQ_API_KEY is set)
# --------------------------------------------------------------------------- #
@pytest.mark.integration
@pytest.mark.skipif(
    not os.getenv("GROQ_API_KEY"),
    reason="GROQ_API_KEY not set; requires a live Groq API key to run",
)
def test_gpt_oss_live_intent_and_explanation() -> None:
    """Real GPT-OSS 20B smoke test.

    Runs only when ``GROQ_API_KEY`` is present so the normal suite never depends
    on a live API. Verifies intent extraction JSON + validation and explanation
    generation against the real ``openai/gpt-oss-20b`` model.
    """
    assert config.settings.GROQ_MODEL == NEW_MODEL
    assert config.settings.GROQ_API_KEY, "GROQ_API_KEY must be set"

    # 1. Intent extraction
    intent, source = recommend.extract_intent(
        "Where can I buy cheap fuel near Kaduna?"
    )
    assert source == "groq"
    assert intent.fuel_type == "PMS"
    assert intent.sort_preference == "price"
    # 2. Explanation generation against ranked facts
    station = {
        "id": "live-id",
        "name": "NNPC Kaduna",
        "brand": "NNPC",
        "city": "Kaduna",
        "state": "Kaduna",
        "latitude": 10.52,
        "longitude": 7.44,
        "is_active": True,
        "data_source": "seed",
        "verification_status": "verified",
        "fuel_types": [{"code": "PMS", "name": "Petrol (PMS)"}],
        "distance_meters": 800.0,
    }
    intent = recommend.FuelSearchIntent(
        fuel_type="PMS", sort_preference="price", raw="cheap fuel near Kaduna"
    )
    price_map = {
        "live-id": [
            {"fuel_type_code": "PMS", "price_per_litre": 950.0, "status": "verified", "created_at": None}
        ]
    }
    ranked = recommend.rank_recommendations([station], intent, price_map)
    assert ranked, "deterministic ranking produced candidates"
    answer = recommend.generate_explanation(intent, ranked)
    assert isinstance(answer, str) and answer
