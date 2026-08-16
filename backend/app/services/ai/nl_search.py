"""
Groq-powered natural-language search parsing (Phase 8).

Turns a free-form query like "short petrol queues near Ikeja" into structured
station filters (fuel type, queue length, brand, city, state). The prompt and
the JSON→``ParsedQuery`` mapping are separated from the Groq call so the
deterministic logic is unit-testable without an API key.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models import FuelTypeCode, QueueLength
from app.services.ai.base import extract_json_object
from app.services.ai.provider import groq_chat

_VALID_FUEL_CODES = FuelTypeCode.codes()
_VALID_QUEUE_VALUES = {member.value for member in QueueLength}

_SYSTEM_PROMPT = """\
You extract structured search filters from natural-language queries about \
Nigerian fuel stations. Respond with STRICT JSON only (no markdown, no prose) \
using exactly these keys:
{
  "fuel_type": "PMS" | "AGO" | "DPK" | "LPG" | null,
  "queue_length": "none" | "short" | "medium" | "long" | null,
  "brand": "<e.g. NNPC, Mobil, Total, Conoil, Oando>" | null,
  "city": "<e.g. Ikeja, Lekki, Victoria Island, Wuse 2>" | null,
  "state": "<e.g. Lagos, FCT>" | null
}
Only populate a field when the user clearly expressed it. Map casual terms: \
"petrol"->PMS, "diesel"->AGO, "kerosene"->DPK, "gas/cooking gas"->LPG. \
Treat neighbourhoods (e.g. Ikeja, Lekki) as the city.
"""


@dataclass
class ParsedQuery:
    fuel_type: str | None
    queue_length: QueueLength | None
    brand: str | None
    city: str | None
    state: str | None
    raw: str


def build_system_prompt() -> str:
    return _SYSTEM_PROMPT


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def to_parsed_query(data: dict[str, Any], raw: str) -> ParsedQuery:
    """Validate/normalise the LLM's JSON into a ``ParsedQuery`` (pure)."""
    fuel = _clean(data.get("fuel_type"))
    if fuel is not None:
        fuel = fuel.upper()
        if fuel not in _VALID_FUEL_CODES:
            fuel = None

    queue_raw = _clean(data.get("queue_length"))
    queue_length: QueueLength | None = None
    if queue_raw is not None:
        queue_raw = queue_raw.lower()
        if queue_raw in _VALID_QUEUE_VALUES:
            queue_length = QueueLength(queue_raw)

    return ParsedQuery(
        fuel_type=fuel,
        queue_length=queue_length,
        brand=_clean(data.get("brand")),
        city=_clean(data.get("city")),
        state=_clean(data.get("state")),
        raw=raw,
    )


def parse_natural_query(text: str) -> ParsedQuery:
    """Call Groq to parse ``text`` into a structured ``ParsedQuery``.

    Raises ``AINotConfiguredError`` when ``GROQ_API_KEY`` is not set, and
    ``AIProviderError`` (safe category, already logged) when the provider call
    fails. Client construction — including ``timeout`` and ``max_retries``,
    which are constructor-only arguments — lives in
    ``app.services.ai.provider`` so no call site can pass them per request.
    """
    content = groq_chat(
        [
            {"role": "system", "content": build_system_prompt()},
            {"role": "user", "content": text},
        ],
        feature="nl_search",
        json_mode=True,
    )
    return to_parsed_query(extract_json_object(content), text)
