"""
Groq conversational assistant tests (the general-Q&A half of the Groq
responsibility).

These prove the journey a real user takes when they type a question that is not
a station search:

    user message -> deterministic router -> Groq chat completion
                 -> answer + honest answer_source -> API response

and that every failure mode (no key, timeout, rate limit, auth, empty answer,
malformed provider object) degrades to the deterministic safety answer which is
ALWAYS labelled ``answer_source="fallback"`` — a fallback can never be mistaken
for a working Groq integration.

The Groq SDK is faked; no test touches the network.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.core import config
from app.services.ai import chat as chat_service
from app.services.ai.provider import AIProviderError

MODEL = "openai/gpt-oss-20b"


# --------------------------------------------------------------------------- #
# Fake Groq SDK
# --------------------------------------------------------------------------- #
def install_fake_groq(
    monkeypatch: pytest.MonkeyPatch,
    *,
    content: str | None = "Sure — I can help you find fuel nearby.",
    raises: Exception | None = None,
):
    """Install a recording fake for ``groq.Groq``.

    Returns ``(client_calls, create_calls)``: constructor kwargs and
    per-request kwargs, so tests can assert that ``max_retries``/``timeout``
    live on the client and never on ``create()``.
    """
    client_calls: list[dict[str, Any]] = []
    create_calls: list[dict[str, Any]] = []

    class _FakeCompletions:
        def create(self, **kwargs: Any) -> Any:
            create_calls.append(kwargs)
            if raises is not None:
                raise raises
            message = type("Msg", (), {"content": content})()
            choice = type("Choice", (), {"message": message})()
            return type("Resp", (), {"choices": [choice]})()

    class _FakeChat:
        completions = _FakeCompletions()

    class _FakeGroq:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            client_calls.append(kwargs)
            self.chat = _FakeChat()

    monkeypatch.setattr("groq.Groq", _FakeGroq)
    monkeypatch.setattr(config.settings, "GROQ_API_KEY", "test-key")
    return client_calls, create_calls


# --------------------------------------------------------------------------- #
# 1. Deterministic routing (search vs. conversation)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("message", "expected"),
    [
        # Conversational — must NOT trigger a database station search.
        ("Hello, what can you help me with?", chat_service.MODE_CONVERSATION),
        (
            "Why should I verify a fuel station before relying on its reported price?",
            chat_service.MODE_CONVERSATION,
        ),
        ("Why did you recommend this station?", chat_service.MODE_CONVERSATION),
        ("What fuel types can I report?", chat_service.MODE_CONVERSATION),
        ("How does report verification work?", chat_service.MODE_CONVERSATION),
        ("thanks!", chat_service.MODE_CONVERSATION),
        ("", chat_service.MODE_CONVERSATION),
        # Station searches — must reach the recommendation pipeline.
        ("Find me a nearby station with cheap petrol.", chat_service.MODE_SEARCH),
        ("Find the cheapest petrol near me", chat_service.MODE_SEARCH),
        ("Find the closest CNG station", chat_service.MODE_SEARCH),
        ("I need diesel under 1000", chat_service.MODE_SEARCH),
        ("Which nearby station is most reliable?", chat_service.MODE_SEARCH),
        ("only verified petrol stations", chat_service.MODE_SEARCH),
        ("Where can I find cheap petrol?", chat_service.MODE_SEARCH),
    ],
)
def test_router_classification(message: str, expected: str) -> None:
    assert chat_service.classify_query(message) == expected


# --------------------------------------------------------------------------- #
# 2. Prompt grounding (built from the app's own catalogue, not hardcoded)
# --------------------------------------------------------------------------- #
def test_system_prompt_grounds_the_model_in_real_capabilities() -> None:
    prompt = chat_service.build_chat_system_prompt()
    for code in ("PMS", "AGO", "DPK", "LPG", "CNG"):
        assert code in prompt
    assert "NEVER invent" in prompt
    # Report statuses and queue lengths come from the models.
    assert "pending" in prompt and "verified" in prompt
    assert "short" in prompt and "long" in prompt


# --------------------------------------------------------------------------- #
# 3. Successful Groq conversation
# --------------------------------------------------------------------------- #
def test_normal_conversation_uses_groq_and_configured_model(monkeypatch) -> None:
    client_calls, create_calls = install_fake_groq(
        monkeypatch, content="I can help you find fuel stations near you."
    )

    answer, source = chat_service.answer_question("Hello, what can you help me with?")

    assert source == "groq"
    assert "fuel" in answer.lower()
    call = create_calls[0]
    assert call["model"] == config.settings.GROQ_MODEL == MODEL
    # Regression guard: max_retries/timeout are CLIENT options, never per-request.
    assert "max_retries" not in call
    assert client_calls[0]["max_retries"] == config.settings.AI_MAX_RETRIES
    assert client_calls[0]["timeout"] == config.settings.AI_TIMEOUT_SECONDS
    # A conversational answer is plain text, not JSON mode.
    assert "response_format" not in call


def test_fuel_question_is_answered_conversationally(monkeypatch) -> None:
    install_fake_groq(
        monkeypatch,
        content="Prices are crowd-reported, so verification tells you how much to trust them.",
    )
    answer, source = chat_service.answer_question(
        "Why should I verify a fuel station before relying on its reported price?"
    )
    assert source == "groq"
    assert "verification" in answer.lower() or "verify" in answer.lower()


def test_contextual_question_receives_app_capabilities(monkeypatch) -> None:
    _, create_calls = install_fake_groq(monkeypatch, content="You can report PMS, AGO, DPK, LPG and CNG.")
    chat_service.answer_question("What fuel types can I report?")
    system_message = create_calls[0]["messages"][0]
    assert system_message["role"] == "system"
    assert "CNG" in system_message["content"]


# --------------------------------------------------------------------------- #
# 4. Invalid / empty input
# --------------------------------------------------------------------------- #
def test_blank_input_never_calls_the_provider(monkeypatch) -> None:
    _, create_calls = install_fake_groq(monkeypatch)
    answer, source = chat_service.answer_question("   ")
    assert create_calls == []
    assert source == "fallback"
    assert answer


# --------------------------------------------------------------------------- #
# 5. Provider failures -> honest fallback
# --------------------------------------------------------------------------- #
class _Timeout(Exception):
    pass


_Timeout.__name__ = "APITimeoutError"


class _RateLimit(Exception):
    status_code = 429


class _AuthError(Exception):
    status_code = 401


class _ModelGone(Exception):
    status_code = 404


@pytest.mark.parametrize(
    ("exception", "category"),
    [
        (_Timeout("timeout"), "TIMEOUT"),
        (_RateLimit("429"), "RATE_LIMITED"),
        (_AuthError("401"), "AUTH_ERROR"),
        (_ModelGone("404"), "MODEL_NOT_FOUND"),
        (RuntimeError("boom"), "PROVIDER_ERROR"),
    ],
)
def test_provider_failures_are_classified_and_fall_back(
    monkeypatch, exception: Exception, category: str
) -> None:
    install_fake_groq(monkeypatch, raises=exception)

    with pytest.raises(AIProviderError) as excinfo:
        chat_service.generate_chat_answer("Hello there")
    assert excinfo.value.category == category

    # The user-facing helper degrades instead of erroring — and says so.
    answer, source = chat_service.answer_question("Hello there")
    assert source == "fallback"
    assert answer == chat_service.fallback_answer()


def test_empty_provider_answer_is_a_failure_not_a_success(monkeypatch) -> None:
    install_fake_groq(monkeypatch, content="   ")
    with pytest.raises(AIProviderError) as excinfo:
        chat_service.generate_chat_answer("Hello there")
    assert excinfo.value.category == "EMPTY_RESPONSE"

    answer, source = chat_service.answer_question("Hello there")
    assert source == "fallback"
    assert answer == chat_service.fallback_answer()


def test_missing_api_key_falls_back(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "GROQ_API_KEY", "")
    answer, source = chat_service.answer_question("Hello, what can you help me with?")
    assert source == "fallback"
    assert answer == chat_service.fallback_answer()


def test_fallback_answer_never_pretends_to_have_live_data() -> None:
    answer = chat_service.fallback_answer()
    # It must not claim a station/price it cannot know.
    assert "₦" not in answer
    assert "near me" in answer.lower() or "cheapest petrol" in answer.lower()


def test_provider_failure_logs_category_without_secrets(monkeypatch, caplog) -> None:
    install_fake_groq(monkeypatch, raises=_RateLimit("429 too many requests"))
    monkeypatch.setattr(config.settings, "GROQ_API_KEY", "super-secret-key")

    with caplog.at_level("WARNING"):
        chat_service.answer_question("Hello there")

    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "provider=groq" in logged
    assert "feature=chat" in logged
    assert "category=RATE_LIMITED" in logged
    assert "model=openai/gpt-oss-20b" in logged
    assert "super-secret-key" not in logged


# --------------------------------------------------------------------------- #
# 6. HTTP contract: POST /api/v1/ai/chat
# --------------------------------------------------------------------------- #
async def test_chat_endpoint_returns_groq_answer(client, monkeypatch) -> None:
    install_fake_groq(monkeypatch, content="I can help you find fuel near you.")

    response = await client.post(
        "/api/v1/ai/chat", json={"message": "Hello, what can you help me with?"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["answer_source"] == "groq"
    assert body["mode"] == "conversation"
    assert body["model"] == MODEL
    assert body["answer"]


async def test_chat_endpoint_labels_fallback_when_provider_fails(
    client, monkeypatch
) -> None:
    install_fake_groq(monkeypatch, raises=RuntimeError("provider down"))

    response = await client.post("/api/v1/ai/chat", json={"message": "Hi there"})

    assert response.status_code == 200
    body = response.json()
    assert body["answer_source"] == "fallback"  # never reported as Groq
    assert body["answer"]


async def test_chat_endpoint_flags_station_searches_for_the_search_endpoint(
    client, monkeypatch
) -> None:
    install_fake_groq(monkeypatch, content="anything")
    response = await client.post(
        "/api/v1/ai/chat", json={"message": "cheapest petrol near me"}
    )
    assert response.status_code == 200
    assert response.json()["mode"] == "search"


async def test_chat_endpoint_validates_input(client) -> None:
    assert (await client.post("/api/v1/ai/chat", json={"message": ""})).status_code == 422
    assert (
        await client.post("/api/v1/ai/chat", json={"message": "x" * 1001})
    ).status_code == 422
    assert (await client.post("/api/v1/ai/chat", json={})).status_code == 422


async def test_chat_endpoint_is_not_cached(client, monkeypatch) -> None:
    install_fake_groq(monkeypatch)
    response = await client.post("/api/v1/ai/chat", json={"message": "hello"})
    assert response.headers["cache-control"] == "no-store"


# --------------------------------------------------------------------------- #
# 7. The single "Ask Fuel AI" input: POST /api/v1/ai/recommend must answer a
#    conversational question WITHOUT a location and WITHOUT a database query.
# --------------------------------------------------------------------------- #
async def test_recommend_answers_general_question_without_location(
    client, monkeypatch
) -> None:
    install_fake_groq(monkeypatch, content="I help drivers find fuel in Nigeria.")

    async def _must_not_run(*args, **kwargs):  # pragma: no cover - guard
        raise AssertionError("a conversational question must not query stations")

    monkeypatch.setattr("app.services.stations.find_nearby", _must_not_run)

    response = await client.post(
        "/api/v1/ai/recommend", json={"query": "Hello, what can you help me with?"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "conversation"
    assert body["needs_location"] is False  # no GPS needed to answer a question
    assert body["recommendations"] == []
    assert body["answer_source"] == "groq"
    assert body["intent_source"] == "not_applicable"
    assert body["answer"]


async def test_recommend_conversation_falls_back_honestly(client, monkeypatch) -> None:
    install_fake_groq(monkeypatch, raises=RuntimeError("provider down"))

    response = await client.post(
        "/api/v1/ai/recommend",
        json={"query": "Why should I verify a fuel station's reported price?"},
    )

    body = response.json()
    assert body["mode"] == "conversation"
    assert body["answer_source"] == "fallback"
    assert body["answer"]


async def test_recommend_station_search_still_needs_location(client, monkeypatch) -> None:
    install_fake_groq(monkeypatch, content='{"fuel_type":"PMS"}')
    response = await client.post(
        "/api/v1/ai/recommend", json={"query": "cheapest petrol near me"}
    )
    body = response.json()
    assert body["mode"] == "recommendation"
    assert body["needs_location"] is True
    assert "location" in body["answer"].lower()
