"""
Shared AI provider plumbing: client construction, error classification and
secret-safe observability.

Why this module exists
----------------------
Groq and Gemini are called from several places (intent extraction, explanation
generation, conversational answers, photo verification, diagnostics). Before
this module each call site built its own SDK client and swallowed exceptions
with a bare ``except Exception``, so:

* a configuration mistake (bad key, retired model) was indistinguishable from a
  transient timeout in the logs, and
* the deterministic fallback made both look like a working AI to the user.

Everything here is deliberately *secret-safe*: we log the provider, the feature,
the model and a coarse error category (plus the HTTP status when the SDK gives
us one). We never log API keys, Authorization headers, prompts or user content.

SDK contract notes (regression guards)
--------------------------------------
``max_retries`` is a **client constructor** argument of the Groq SDK. It is NOT
a valid keyword for ``client.chat.completions.create()`` — passing it there
raises ``TypeError: Completions.create() got an unexpected keyword argument
'max_retries'`` before any HTTP request happens. ``build_groq_client`` is the
only place allowed to set it, and ``groq_chat`` is the only place that builds a
completion request, so the mistake cannot reappear in a call site.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

from app.core.config import settings
from app.services.ai.base import AINotConfiguredError

logger = logging.getLogger(__name__)

# Coarse, non-sensitive error categories used in logs and diagnostics.
CATEGORY_TIMEOUT = "TIMEOUT"
CATEGORY_RATE_LIMITED = "RATE_LIMITED"
CATEGORY_AUTH = "AUTH_ERROR"
CATEGORY_MODEL_NOT_FOUND = "MODEL_NOT_FOUND"
CATEGORY_BAD_REQUEST = "BAD_REQUEST"
CATEGORY_NETWORK = "NETWORK_ERROR"
CATEGORY_EMPTY = "EMPTY_RESPONSE"
CATEGORY_SDK_PARAMETER = "SDK_PARAMETER_ERROR"
CATEGORY_SDK_MISSING = "SDK_NOT_INSTALLED"
CATEGORY_PROVIDER = "PROVIDER_ERROR"


class AIProviderError(RuntimeError):
    """An AI provider call failed. Carries a safe category, never a secret."""

    def __init__(
        self,
        category: str,
        *,
        provider: str,
        feature: str,
        model: str | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(f"{provider} {feature} failed ({category})")
        self.category = category
        self.provider = provider
        self.feature = feature
        self.model = model
        self.status_code = status_code


def _status_code_of(exc: BaseException) -> int | None:
    for attribute in ("status_code", "code", "http_status"):
        value = getattr(exc, attribute, None)
        if isinstance(value, int):
            return value
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    return status if isinstance(status, int) else None


def classify_provider_error(exc: BaseException) -> tuple[str, int | None]:
    """Map an SDK/network exception to ``(category, http_status | None)``.

    Classification is intentionally based on the exception *type name* and HTTP
    status rather than on message text, so no user content or credential ever
    influences (or leaks into) the category.
    """
    name = type(exc).__name__
    status = _status_code_of(exc)

    if "Timeout" in name or "Deadline" in name:
        return CATEGORY_TIMEOUT, status
    if "RateLimit" in name or "ResourceExhausted" in name or status == 429:
        return CATEGORY_RATE_LIMITED, status
    if (
        "Authentication" in name
        or "PermissionDenied" in name
        or "Unauthenticated" in name
        or "Unauthorized" in name
        or "Forbidden" in name
        or status in (401, 403)
    ):
        return CATEGORY_AUTH, status
    if "NotFound" in name or status == 404:
        return CATEGORY_MODEL_NOT_FOUND, status
    if "BadRequest" in name or "InvalidArgument" in name or status == 400:
        return CATEGORY_BAD_REQUEST, status
    if "Connection" in name or "Network" in name or "DNS" in name or "Proxy" in name:
        return CATEGORY_NETWORK, status
    if name in ("TypeError", "AttributeError", "ValueError"):
        # e.g. an unsupported kwarg passed to the SDK — a code bug, not an outage.
        return CATEGORY_SDK_PARAMETER, status
    if "ImportError" in name or "ModuleNotFound" in name:
        return CATEGORY_SDK_MISSING, status
    if isinstance(status, int) and 500 <= status < 600:
        return CATEGORY_PROVIDER, status
    return CATEGORY_PROVIDER, status


def log_provider_failure(
    *,
    provider: str,
    feature: str,
    model: str | None,
    category: str,
    status_code: int | None,
) -> None:
    """Emit one structured, secret-free log line for a failed AI call."""
    logger.warning(
        "[AI] provider=%s feature=%s model=%s category=%s status=%s",
        provider,
        feature,
        model or "-",
        category,
        status_code if status_code is not None else "-",
    )


def provider_error(
    exc: BaseException,
    *,
    provider: str,
    feature: str,
    model: str | None,
) -> AIProviderError:
    """Classify ``exc``, log it safely and return the wrapping error."""
    category, status = classify_provider_error(exc)
    log_provider_failure(
        provider=provider,
        feature=feature,
        model=model,
        category=category,
        status_code=status,
    )
    return AIProviderError(
        category,
        provider=provider,
        feature=feature,
        model=model,
        status_code=status,
    )


# --------------------------------------------------------------------------- #
# Groq
# --------------------------------------------------------------------------- #
def build_groq_client() -> Any:
    """Construct the Groq SDK client with timeout + retries set correctly.

    ``timeout`` and ``max_retries`` belong on the constructor. Retries are
    SDK-level HTTP retries (connection errors, 408/429/5xx) with exponential
    backoff; they are bounded by ``AI_MAX_RETRIES`` so a provider incident can
    never stall a user request for longer than roughly
    ``AI_TIMEOUT_SECONDS * (AI_MAX_RETRIES + 1)``.

    Raises ``AINotConfiguredError`` when ``GROQ_API_KEY`` is empty.
    """
    if not settings.GROQ_API_KEY:
        raise AINotConfiguredError(
            "Groq is not configured (GROQ_API_KEY is missing)."
        )

    # Imported lazily so importing the AI services never requires the SDK.
    from groq import Groq

    return Groq(
        api_key=settings.GROQ_API_KEY,
        timeout=settings.AI_TIMEOUT_SECONDS,
        max_retries=settings.AI_MAX_RETRIES,
    )


def groq_chat(
    messages: Iterable[dict[str, str]],
    *,
    feature: str,
    json_mode: bool = False,
    temperature: float | None = None,
    max_completion_tokens: int | None = None,
) -> str:
    """Run one Groq chat completion and return its text content.

    The single place in the codebase that builds a Groq completion request.

    * Never passes ``max_retries`` per request (see the module docstring).
    * Raises ``AINotConfiguredError`` when the key is missing.
    * Raises ``AIProviderError`` (with a safe category) for every provider
      failure, including an empty/blank completion — callers decide whether to
      degrade to a deterministic fallback, and the response tells the user
      which happened.
    """
    client = build_groq_client()
    model = settings.GROQ_MODEL

    request: dict[str, Any] = {"model": model, "messages": list(messages)}
    if json_mode:
        request["response_format"] = {"type": "json_object"}
    if temperature is not None:
        request["temperature"] = temperature
    if max_completion_tokens is not None:
        request["max_completion_tokens"] = max_completion_tokens

    try:
        response = client.chat.completions.create(**request)
    except Exception as exc:  # noqa: BLE001 - classified + re-raised below
        raise provider_error(exc, provider="groq", feature=feature, model=model) from exc

    try:
        content = response.choices[0].message.content or ""
    except (AttributeError, IndexError, TypeError) as exc:
        raise provider_error(
            exc, provider="groq", feature=feature, model=model
        ) from exc

    if not content.strip():
        log_provider_failure(
            provider="groq",
            feature=feature,
            model=model,
            category=CATEGORY_EMPTY,
            status_code=None,
        )
        raise AIProviderError(
            CATEGORY_EMPTY, provider="groq", feature=feature, model=model
        )

    return content
