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

export interface SignUpResult {
  /** True when a session was created immediately (email confirmation off). */
  isSignedIn: boolean;
  /** True when the user must confirm their email before signing in. */
  requiresEmailConfirmation: boolean;
  email: string | undefined;
}

/**
 * Register a new driver via Supabase Auth. The backend JIT-provisions the local
 * ``users`` row with the default ``driver`` role on the first authenticated
 * request — sign-up never grants admin/station-manager privileges.
 *
 * Behaviour depends on the Supabase project's email-confirmation setting:
 * - When confirmation is OFF, Supabase returns a session immediately and we
 *   push its token into the API client (same as sign-in).
 * - When confirmation is ON, no session is returned; the caller should prompt
 *   the user to check their email.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<SignUpResult> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_*.");
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  const hasSession = !!data.session;
  setAuthToken(data.session?.access_token ?? null);
  return {
    isSignedIn: hasSession,
    requiresEmailConfirmation: !hasSession,
    email: data.user?.email,
  };
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
