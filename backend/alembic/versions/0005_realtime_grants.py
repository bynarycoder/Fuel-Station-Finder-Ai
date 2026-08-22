"""grant SELECT on realtime-exposed tables to anon/authenticated

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-06

Migration 0004 added ``fuel_reports`` and ``fuel_stations`` to the
``supabase_realtime`` publication, but never granted the roles used by
Supabase Realtime (``anon`` and ``authenticated``) permission to read those
tables. On a fresh Supabase project the tables are owned by the migration role
and default privileges do not include SELECT for these roles, so Realtime
clients fail to receive changes and the PostgREST/Realtime layer returns
permission errors.

This migration grants read-only SELECT on the two tables that are already
published to Realtime. It is deliberately minimal:

* Only SELECT is granted (no INSERT/UPDATE/DELETE) — writes stay under the
  backend's authorization layer, which uses the privileged connection and its
  own role checks.
* RLS is NOT disabled and no broad ``GRANT`` to ``PUBLIC`` is issued.
* The grants are idempotent and only run when the Supabase roles exist (they
  always do on Supabase; on a vanilla local Postgres they are absent and these
  guarded ``DO`` blocks are a safe no-op), so this is fully reversible and works
  in Alembic's offline (``--sql``) mode too.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Tables already opted into the supabase_realtime publication by migration 0004.
_TABLES = ("fuel_reports", "fuel_stations")
# Supabase roles that need read access for Realtime to stream rows.
_ROLES = ("anon", "authenticated")


def upgrade() -> None:
    for role in _ROLES:
        for table in _TABLES:
            op.execute(
                f"""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
        GRANT SELECT ON {table} TO {role};
    END IF;
END $$;
                """.strip()
            )


def downgrade() -> None:
    for role in _ROLES:
        for table in _TABLES:
            op.execute(
                f"""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
        REVOKE SELECT ON {table} FROM {role};
    END IF;
END $$;
                """.strip()
            )
