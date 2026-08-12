"""
Seed-data catalogue for the Nigerian Fuel Station Finder.

Splitting the catalogue across modules keeps each file reviewable while the
public surface (``app.scripts.seed``) stays a single import location for tests
and CLI entrypoints.

* :mod:`.fuel_types` – canonical petroleum product catalogue (PMS/AGO/DPK/LPG/CNG)
* :mod:`.lagos_fct`   – the original 18 stations (Lagos + FCT) kept verbatim
* :mod:`.nationwide`  – the expanded demo coverage of the other 34 states + FCT
* :mod:`.stations`    – the combined :data:`STATIONS` list consumed by ``seed.py``
"""

from .stations import LAGOS_FCT_STATIONS, NATIONWIDE_STATIONS, STATIONS

__all__ = ["STATIONS", "LAGOS_FCT_STATIONS", "NATIONWIDE_STATIONS"]
