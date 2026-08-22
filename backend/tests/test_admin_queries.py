"""
Query-construction & pure-helper tests for the admin service (Phase 9).

Compiles the admin query builders against the PostgreSQL dialect (no DB, no
mocks) to assert the moderation list shows every status, and exercises the pure
``user_to_public`` mapper with an in-memory object.
"""

from __future__ import annotations

import uuid

from sqlalchemy.dialects import postgresql

from app.models import User, UserRole
from app.services import admin as admin_service


def _compile(stmt) -> str:
    return str(
        stmt.compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )


# --------------------------------------------------------------------------- #
# Report moderation list (no visibility filtering)
# --------------------------------------------------------------------------- #
def test_admin_report_list_does_not_hide_rejected() -> None:
    sql = _compile(
        admin_service.build_admin_report_list_query(
            admin_service.AdminReportFilters(), 0, 10
        )
    )
    # No status filter / no "rejected" exclusion clause.
    assert "rejected" not in sql


def test_admin_report_list_applies_status_filter() -> None:
    filters = admin_service.AdminReportFilters(
        status=admin_service.ReportStatus.VERIFIED
    )
    sql = _compile(admin_service.build_admin_report_list_query(filters, 0, 10))
    assert "verified" in sql


def test_admin_report_count_query_compiles() -> None:
    sql = _compile(admin_service.build_admin_report_count_query(
        admin_service.AdminReportFilters()
    ))
    assert "count(fuel_reports.id)" in sql


# --------------------------------------------------------------------------- #
# Analytics queries
# --------------------------------------------------------------------------- #
def test_station_counts_query_uses_case() -> None:
    sql = _compile(admin_service.build_station_counts_query())
    assert "count(fuel_stations.id)" in sql
    assert "CASE" in sql.upper()


def test_reports_by_status_groups_by_status() -> None:
    sql = _compile(admin_service.build_reports_by_status_query())
    assert "GROUP BY" in sql.upper()
    assert "fuel_reports.status" in sql


def test_users_by_role_groups_by_role() -> None:
    sql = _compile(admin_service.build_users_by_role_query())
    assert "GROUP BY" in sql.upper()
    assert "users.role" in sql


def test_total_reports_query_compiles() -> None:
    sql = _compile(admin_service.build_total_reports_query())
    assert "count(fuel_reports.id)" in sql


# --------------------------------------------------------------------------- #
# Pure mapper
# --------------------------------------------------------------------------- #
def test_user_to_public_maps_user() -> None:
    user = User(
        id=uuid.uuid4(),
        email="admin@naija.dev",
        full_name="Admin User",
        role=UserRole.ADMIN,
        is_active=True,
    )
    payload = admin_service.user_to_public(user)
    assert payload["email"] == "admin@naija.dev"
    assert payload["role"] == UserRole.ADMIN
    assert payload["is_active"] is True
    assert payload["full_name"] == "Admin User"
