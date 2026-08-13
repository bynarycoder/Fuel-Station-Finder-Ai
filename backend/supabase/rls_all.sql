-- ============================================================================
-- Fuel Station Finder AI — Supabase Row Level Security (complete, idempotent)
--
-- Apply this file from the Supabase SQL editor (or via `psql`) so that even a
-- compromised anon/authenticated Supabase client key can never mutate or read
-- beyond what the app intends. The FastAPI backend connects with the
-- privileged service-role connection (or direct DB URL), which bypasses RLS
-- by design; the backend enforces application authorization on top. These
-- policies therefore protect the data when accessed directly through
-- Supabase's PostgREST/Realtime surfaces.
--
-- Security model per table:
--   fuel_stations             anon/authenticated: SELECT only (public browse).
--                             No INSERT/UPDATE/DELETE policies for clients —
--                             station writes happen through the backend only.
--   fuel_reports              anon/authenticated: SELECT (rejected rows are
--                             hidden via RLS too); authenticated: INSERT their
--                             own reports; UPDATE only their own PENDING rows
--                             (e.g. correcting a mistake) — a submitter can
--                             never approve their own report, because status
--                             is a column the client cannot set to
--                             verified/rejected under the WITH CHECK below.
--                             No DELETE for clients.
--   users                     authenticated: SELECT own row only. No client
--                             writes — roles are managed by the backend.
--   favorites                 4 policies (see rls_favorites.sql for the same
--                             rules, kept here for a single-paste setup).
--
-- The `is_admin()` helper deliberately does NOT exist in SQL: admin powers
-- are enforced server-side (users.role in the backend DB, checked by
-- require_roles), never by client-supplied flags.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- fuel_stations: public read-only catalogue
-- ---------------------------------------------------------------------------
ALTER TABLE fuel_stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fuel_stations_anon_select ON fuel_stations;
CREATE POLICY fuel_stations_anon_select
    ON fuel_stations FOR SELECT
    TO anon
    USING (is_active = true);

DROP POLICY IF EXISTS fuel_stations_auth_select ON fuel_stations;
CREATE POLICY fuel_stations_auth_select
    ON fuel_stations FOR SELECT
    TO authenticated
    USING (is_active = true);

-- No insert/update/delete policies: clients cannot modify stations.

-- ---------------------------------------------------------------------------
-- fuel_reports: submit own, read public (non-rejected), update own pending
-- ---------------------------------------------------------------------------
ALTER TABLE fuel_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fuel_reports_anon_select ON fuel_reports;
CREATE POLICY fuel_reports_anon_select
    ON fuel_reports FOR SELECT
    TO anon
    USING (status <> 'rejected');

DROP POLICY IF EXISTS fuel_reports_auth_select ON fuel_reports;
CREATE POLICY fuel_reports_auth_select
    ON fuel_reports FOR SELECT
    TO authenticated
    USING (status <> 'rejected' OR user_id = auth.uid());

DROP POLICY IF EXISTS fuel_reports_auth_insert ON fuel_reports;
CREATE POLICY fuel_reports_auth_insert
    ON fuel_reports FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND status = 'pending'
    );

DROP POLICY IF EXISTS fuel_reports_auth_update_own_pending ON fuel_reports;
CREATE POLICY fuel_reports_auth_update_own_pending
    ON fuel_reports FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid() AND status = 'pending')
    WITH CHECK (
        user_id = auth.uid()
        AND status IN ('pending', 'under_review')
    );

-- No DELETE policy: reports are immutable evidence; removal is backend-only.

-- ---------------------------------------------------------------------------
-- users: self-service read only
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_auth_select_self ON users;
CREATE POLICY users_auth_select_self
    ON users FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- No insert/update/delete policies: profiles are managed by the backend.

-- ---------------------------------------------------------------------------
-- favorites: strictly user-scoped (mirrors backend/app/supabase/rls_favorites.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    station_id UUID NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_favorites_user_station UNIQUE (user_id, station_id)
);

CREATE INDEX IF NOT EXISTS ix_favorites_user_id ON favorites (user_id);
CREATE INDEX IF NOT EXISTS ix_favorites_station_id ON favorites (station_id);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS favorites_select_own ON favorites;
CREATE POLICY favorites_select_own
    ON favorites FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS favorites_insert_own ON favorites;
CREATE POLICY favorites_insert_own
    ON favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS favorites_delete_own ON favorites;
CREATE POLICY favorites_delete_own
    ON favorites FOR DELETE
    USING (auth.uid() = user_id);

-- No UPDATE policy on purpose: favorites are add/remove only.
