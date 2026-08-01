"""
Shared helpers for the AI services.

LLMs don't always return clean JSON — they may wrap it in markdown fences or
prepend prose. ``extract_json_object`` robustly pulls the first JSON object out
of a model response so the parsing layer can stay deterministic and testable.
"""

from __future__ import annotations

import json
import re
from typing import Any

_FENCED_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


class AINotConfiguredError(RuntimeError):
    """Raised when an AI integration is invoked without its API key configured."""


def extract_json_object(text: str | None) -> dict[str, Any]:
    """Best-effort extraction of the first JSON object from ``text``.

    Returns an empty dict when no JSON object can be parsed (callers apply sane
    defaults), so a malformed model response never crashes the request.
    """
    if not text:
        return {}

    cleaned = text.strip()

    fenced = _FENCED_RE.search(cleaned)
    if fenced:
        cleaned = fenced.group(1)
    else:
        obj = _OBJECT_RE.search(cleaned)
        if obj:
            cleaned = obj.group(0)

    try:
        data = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        return {}

    return data if isinstance(data, dict) else {}
