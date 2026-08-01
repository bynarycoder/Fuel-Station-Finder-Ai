"""
Query-construction & pure-helper tests for the reports service (Phase 6/7).

Compiles the service ``Select`` builders against the PostgreSQL dialect (no DB,
no mocks) to assert filters, the public-feed visibility (rejected always
excluded), ordering and pagination, and exercises the pure ``report_to_public``
mapper with in-memory ORM objects.
"""

from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from geoalchemy2 import WKTElement
from sqlalchemy.dialects import postgresql

from app.models import (
    FuelReport,
    FuelStation,
    FuelType,
    QueueLength,
    ReportStatus,
    User,
    UserRole,
)
from app.services import reports as report_service


def _compile(stmt) -> str:
    return str(
        stmt.compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )


# --------------------------------------------------------------------------- #
# Query construction
# --------------------------------------------------------------------------- #
def test_list_query_orders_newest_first_and_paginates() -> None:
    sql = _compile(
        report_service.build_list_query(report_service.ReportFilters(), 40, 20)
    )
    assert "ORDER BY" in sql
    assert "DESC" in sql
    assert "LIMIT" in sql and "OFFSET" in sql


def test_list_query_applies_filters() -> None:
    filters = report_service.ReportFilters(
        station_id=uuid.uuid4(), fuel_type_code="PMS", status=ReportStatus.VERIFIED
    )
    sql = _compile(report_service.build_list_query(filters, 0, 10))
    assert "fuel_reports.fuel_type_code" in sql
    assert "fuel_reports.status" in sql
    assert "fuel_reports.station_id" in sql


def test_public_feed_always_excludes_rejected() -> None:
    sql = _compile(report_service.build_list_query(report_service.ReportFilters(), 0, 10))
    # The public feed carries a "status != 'rejected'" visibility clause.
    assert "rejected" in sql


def test_count_query_excludes_rejected_and_applies_filters() -> None:
    filters = report_service.ReportFilters(status=ReportStatus.PENDING)
    sql = _compile(report_service.build_count_query(filters))
    assert "count(fuel_reports.id)" in sql
    assert "pending" in sql
    assert "rejected" in sql


def test_get_query_filters_by_id() -> None:
    report_id = uuid.uuid4()
    sql = _compile(report_service.build_get_query(report_id))
    assert "WHERE" in sql and "fuel_reports.id" in sql


# --------------------------------------------------------------------------- #
# Pure mapper
# --------------------------------------------------------------------------- #
def test_report_to_public_maps_report() -> None:
    station = FuelStation(
        name="NNPC Ikeja",
        brand="NNPC",
        is_active=True,
        location=WKTElement("POINT(3.35 6.6)", srid=4326),
    )
    station.id = uuid.uuid4()
    fuel_type = FuelType(code="PMS", name="Premium Motor Spirit")
    reporter = User(
        id=uuid.uuid4(), email="ada@naija.dev", role=UserRole.DRIVER, full_name="Ada"
    )

    now = datetime.datetime.now(datetime.timezone.utc)
    report = FuelReport(
        station_id=station.id,
        user_id=reporter.id,
        fuel_type_code="PMS",
        price_per_litre=Decimal("650.00"),
        queue_length=QueueLength.SHORT,
        photo_url="/media/abc.png",
        notes="Short queue, PMS available.",
        status=ReportStatus.PENDING,
    )
    report.id = uuid.uuid4()
    report.created_at = now
    report.updated_at = now
    report.station = station
    report.reported_by = reporter
    report.fuel_type = fuel_type

    payload = report_service.report_to_public(report)

    assert payload["station"]["name"] == "NNPC Ikeja"
    assert payload["station"]["brand"] == "NNPC"
    assert payload["reported_by"]["full_name"] == "Ada"
    assert payload["fuel_type"] == {"code": "PMS", "name": "Premium Motor Spirit"}
    assert payload["price_per_litre"] == 650.0
    assert payload["queue_length"] == QueueLength.SHORT
    assert payload["status"] == ReportStatus.PENDING
    assert payload["photo_url"] == "/media/abc.png"


def test_report_to_public_handles_null_price_and_queue() -> None:
    station = FuelStation(
        name="X", is_active=True, location=WKTElement("POINT(3 6)", srid=4326)
    )
    station.id = uuid.uuid4()
    reporter = User(id=uuid.uuid4(), email="b@c.com", role=UserRole.DRIVER)
    fuel_type = FuelType(code="AGO", name="Diesel")
    report = FuelReport(
        station_id=station.id,
        user_id=reporter.id,
        fuel_type_code="AGO",
        price_per_litre=None,
        queue_length=None,
        status=ReportStatus.PENDING,
    )
    report.id = uuid.uuid4()
    report.station = station
    report.reported_by = reporter
    report.fuel_type = fuel_type
    payload = report_service.report_to_public(report)
    assert payload["price_per_litre"] is None
    assert payload["queue_length"] is None
