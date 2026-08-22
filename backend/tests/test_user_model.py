"""
Schema tests for the Phase 3 ``User`` model (metadata introspection, no DB).
"""

from __future__ import annotations

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from app.core.database import Base
from app.models import User, UserRole


def test_user_registered_on_metadata() -> None:
    assert "users" in Base.metadata.tables


def test_user_id_is_supabase_uuid_primary_key() -> None:
    pk_columns = [c.name for c in User.__table__.primary_key.columns]
    assert pk_columns == ["id"]
    # The id mirrors Supabase auth.users.id and must NOT be auto-generated.
    assert User.__table__.c.id.default is None


def test_email_is_unique() -> None:
    unique_constraints = [
        c.name
        for c in User.__table__.constraints
        if c.__class__.__name__ == "UniqueConstraint"
    ]
    assert "uq_users_email" in unique_constraints


def test_role_check_constraint_lists_all_roles() -> None:
    ddl = str(CreateTable(User.__table__).compile(dialect=postgresql.dialect()))
    assert "ck_users_role" in ddl
    for value in ("driver", "station_manager", "admin"):
        assert value in ddl


def test_user_role_enum_values() -> None:
    assert {role.value for role in UserRole} == {
        "driver",
        "station_manager",
        "admin",
    }


def test_every_role_has_a_description() -> None:
    for role in UserRole:
        assert isinstance(role.description, str) and role.description


def test_default_role_is_driver() -> None:
    assert User.__table__.c.role.default.arg == UserRole.DRIVER


def test_default_is_active_is_true() -> None:
    assert User.__table__.c.is_active.default.arg is True


def test_user_ddl_compiles_on_postgres() -> None:
    ddl = str(CreateTable(User.__table__).compile(dialect=postgresql.dialect()))
    assert "CREATE TABLE users" in ddl
    # Credentials are never stored — only identity + role metadata.
    for forbidden in ("password", "hash", "secret"):
        assert forbidden not in ddl.lower()
