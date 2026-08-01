/**
 * Supabase client (lazy, config-guarded).
 *
 * Returns ``null`` when the public Supabase env vars are absent (e.g. local
 * development), so realtime features degrade gracefully to React Query polling
 * instead of crashing. In production (Vercel + Supabase) the env vars are set
 * and the client is created once.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let checked = false;

export function getSupabase(): SupabaseClient | null {
  if (checked) return client;
  checked = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    client = createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}

/** True when a Supabase project is configured (i.e. realtime is available). */
export function isRealtimeEnabled(): boolean {
  return getSupabase() !== null;
}
