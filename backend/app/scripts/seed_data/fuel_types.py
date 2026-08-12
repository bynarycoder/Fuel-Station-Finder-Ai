"""
Canonical Nigerian petroleum products.

These are the small, stable reference rows that populate the ``fuel_types``
table. Codes match the :class:`app.models.fuel_type.FuelTypeCode` enum and the
``ck_fuel_types_code_domain`` check constraint.
"""

from __future__ import annotations

FUEL_TYPES: list[dict[str, str | bool]] = [
    {
        "code": "PMS",
        "name": "Premium Motor Spirit",
        "description": (
            "Petrol — the primary fuel for most passenger vehicles in Nigeria."
        ),
        "is_active": True,
    },
    {
        "code": "AGO",
        "name": "Automotive Gas Oil",
        "description": (
            "Diesel — used by heavy-duty vehicles, commercial transport and "
            "generators."
        ),
        "is_active": True,
    },
    {
        "code": "DPK",
        "name": "Dual Purpose Kerosene",
        "description": (
            "Household Kerosene (HHK) — used for cooking stoves and lighting."
        ),
        "is_active": True,
    },
    {
        "code": "LPG",
        "name": "Liquefied Petroleum Gas",
        "description": (
            "Cooking Gas — increasingly retailed at modern filling stations."
        ),
        "is_active": True,
    },
    {
        "code": "CNG",
        "name": "Compressed Natural Gas",
        "description": (
            "Autogas (CNG) — cleaner alternative fuel for vehicles, expanding "
            "across Nigerian corridors."
        ),
        "is_active": True,
    },
]
