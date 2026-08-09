-- ============================================================================
-- Fuel Station Finder AI — Supabase RLS for user favorites
--
-- Run this on the Supabase SQL editor AFTER migration 0007 has created the
-- ``favorites`` table (or create the table with this script on a fresh
-- Supabase-managed database).
--
-- Security model:
--   * RLS is enabled; all access is through policies.
--   * Users can SELECT/INSERT/DELETE ONLY their own rows (auth.uid() = user_id).
--   * There is no UPDATE policy — favorites are created and deleted, never
--     mutated. (The backend also exposes no update endpoint.)
--   * ``service_role`` (the backend's privileged connection) bypasses RLS, so
--     the FastAPI endpoints continue to work with the backend's own JWT role
--     checks on top.
-- ============================================================================

-- Table (idempotent; skip if migration 0007 already created it).
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

-- Enable RLS (idempotent).
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Users can only see their own favorites.
DROP POLICY IF EXISTS favorites_select_own ON favorites;
CREATE POLICY favorites_select_own
    ON favorites FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only add their own favorites (no duplicate rows — unique index).
DROP POLICY IF EXISTS favorites_insert_own ON favorites;
CREATE POLICY favorites_insert_own
    ON favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can only remove their own favorites.
DROP POLICY IF EXISTS favorites_delete_own ON favorites;
CREATE POLICY favorites_delete_own
    ON favorites FOR DELETE
    USING (auth.uid() = user_id);

-- No UPDATE policy on purpose: favorites are add/remove only.
