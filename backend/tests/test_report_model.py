"""
Schema tests for the Phase 6 ``FuelReport`` model (metadata introspection, no DB).
"""

from __future__ import annotations

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from app.core.database import Base
from app.models import FuelReport, QueueLength, ReportStatus


def test_report_registered_on_metadata() -> None:
    assert "fuel_reports" in Base.metadata.tables


def test_report_has_cascading_foreign_keys() -> None:
    fks = {fk.parent.name: fk for fk in FuelReport.__table__.foreign_keys}
    assert set(fks) == {"station_id", "user_id", "fuel_type_code", "reviewed_by"}
    assert fks["station_id"].column.table.name == "fuel_stations"
    assert fks["user_id"].column.table.name == "users"
    assert fks["fuel_type_code"].column.table.name == "fuel_types"
    for fk in ("station_id", "user_id", "fuel_type_code"):
        assert fks[fk].ondelete == "CASCADE"
    # Reviewer FK never cascades — deleting a user keeps the report evidence
    # intact and merely detaches the reviewer reference.
    assert fks["reviewed_by"].column.table.name == "users"
    assert fks["reviewed_by"].ondelete == "SET NULL"


def test_report_id_auto_generated() -> None:
    pk = [c.name for c in FuelReport.__table__.primary_key.columns]
    assert pk == ["id"]
    assert FuelReport.__table__.c.id.default is not None  # default=uuid4


def test_report_indexes_present() -> None:
    names = {i.name for i in FuelReport.__table__.indexes}
    assert {
        "ix_fuel_reports_station_id",
        "ix_fuel_reports_user_id",
        "ix_fuel_reports_status",
        "ix_fuel_reports_created_at",
    }.issubset(names)


def test_status_and_queue_check_constraints() -> None:
    ddl = str(CreateTable(FuelReport.__table__).compile(dialect=postgresql.dialect()))
    assert "ck_fuel_reports_status" in ddl
    for value in ("pending", "under_review", "verified", "rejected"):
        assert value in ddl
    assert "ck_fuel_reports_queue_length" in ddl
    for value in ("none", "short", "medium", "long"):
        assert value in ddl


def test_status_defaults_to_pending() -> None:
    assert FuelReport.__table__.c.status.default.arg == ReportStatus.PENDING


def test_enum_values() -> None:
    assert {s.value for s in ReportStatus} == {
        "pending",
        "under_review",
        "verified",
        "rejected",
    }
    assert {q.value for q in QueueLength} == {"none", "short", "medium", "long"}


def test_price_and_queue_are_optional_columns() -> None:
    assert FuelReport.__table__.c.price_per_litre.nullable is True
    assert FuelReport.__table__.c.queue_length.nullable is True
    assert FuelReport.__table__.c.photo_url.nullable is True


def test_report_ddl_compiles() -> None:
    ddl = str(CreateTable(FuelReport.__table__).compile(dialect=postgresql.dialect()))
    assert "CREATE TABLE fuel_reports" in ddl
