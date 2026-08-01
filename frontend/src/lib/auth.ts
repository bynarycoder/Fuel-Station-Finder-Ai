"use client";

/**
 * Auth helpers backed by Supabase Auth. The access token is pushed into the API
 * client so authenticated/admin requests carry the Authorization header.
 */

import { getSupabase } from "@/lib/supabase";
import { setAuthToken } from "@/services/api";

export async function signInWithEmail(email: string, password: string) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_*.");
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  setAuthToken(data.session?.access_token ?? null);
  return data;
}

export async function restoreSession(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  setAuthToken(token);
  return token;
}

export async function signOut() {
  const supabase = getSupabase();
  setAuthToken(null);
  if (supabase) await supabase.auth.signOut();
}

export function isAuthAvailable() {
  return getSupabase() !== null;
}
