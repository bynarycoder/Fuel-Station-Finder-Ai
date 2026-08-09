"""
Unit tests for the CNG fuel type (Phase 5).

CNG must be a first-class fuel: enum, DB check constraint, seed catalogue row,
and offered by at least one seeded station (integrity mirrors the existing
``test_seed_data`` guarantees for PMS/AGO/DPK/LPG).
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint

from app.models import FuelType, FuelTypeCode
from app.scripts.seed import FUEL_TYPES, STATIONS


def test_fuel_type_enum_includes_cng() -> None:
    assert "CNG" in FuelTypeCode.codes()
    assert FuelTypeCode.CNG.value == "CNG"


def test_fuel_type_table_check_constraint_allows_cng() -> None:
    checks = [
        c
        for c in FuelType.__table__.constraints
        if isinstance(c, CheckConstraint)
    ]
    assert any("CNG" in str(c.sqltext) for c in checks), (
        "ck_fuel_types_code_domain must admit CNG"
    )


def test_seed_catalogue_includes_cng() -> None:
    cng = next((ft for ft in FUEL_TYPES if ft["code"] == "CNG"), None)
    assert cng is not None
    assert cng["name"]
    assert cng["description"]
    assert cng["is_active"] is True


def test_seed_stations_offer_cng() -> None:
    offered = {code for s in STATIONS for code in s["fuel_types"]}
    assert "CNG" in offered
