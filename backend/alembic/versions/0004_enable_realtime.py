"""enable Supabase Realtime for fuel_reports and fuel_stations

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-01

Opts the ``fuel_reports`` and ``fuel_stations`` tables into the Supabase
Realtime publication so frontend clients can subscribe to row changes via
``postgres_changes`` (Phase 7). On vanilla PostgreSQL (e.g. the local
docker-compose DB, which has no ``supabase_realtime`` publication) this is a
safe no-op; the guarded ``DO`` blocks check for the publication's existence and
membership before altering it, so the migration is fully idempotent and
reversible.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_publication_tables
                    WHERE pubname = 'supabase_realtime' AND tablename = 'fuel_reports'
                ) THEN
                    ALTER PUBLICATION supabase_realtime ADD TABLE fuel_reports;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_publication_tables
                    WHERE pubname = 'supabase_realtime' AND tablename = 'fuel_stations'
                ) THEN
                    ALTER PUBLICATION supabase_realtime ADD TABLE fuel_stations;
                END IF;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
                IF EXISTS (
                    SELECT 1 FROM pg_publication_tables
                    WHERE pubname = 'supabase_realtime' AND tablename = 'fuel_reports'
                ) THEN
                    ALTER PUBLICATION supabase_realtime DROP TABLE fuel_reports;
                END IF;
                IF EXISTS (
                    SELECT 1 FROM pg_publication_tables
                    WHERE pubname = 'supabase_realtime' AND tablename = 'fuel_stations'
                ) THEN
                    ALTER PUBLICATION supabase_realtime DROP TABLE fuel_stations;
                END IF;
            END IF;
        END $$;
        """
    )
