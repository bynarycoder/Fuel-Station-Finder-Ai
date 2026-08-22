"""
Aggregated station catalogue consumed by :mod:`app.scripts.seed`.

Concatenates the **original 18** Lagos/FCT records (kept verbatim so the
production database rows remain untouched) with the nationwide demo coverage
spread across all 36 states + FCT.
"""

from __future__ import annotations

from .lagos_fct import LAGOS_FCT_STATIONS
from .nationwide import NATIONWIDE_STATIONS

#: Master catalogue — order preserved so log output is stable.
STATIONS: list[dict] = list(LAGOS_FCT_STATIONS) + list(NATIONWIDE_STATIONS)

__all__ = ["STATIONS", "LAGOS_FCT_STATIONS", "NATIONWIDE_STATIONS"]
