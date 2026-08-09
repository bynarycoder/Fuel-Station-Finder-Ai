"use client";

/**
 * Auth helpers backed by Supabase Auth. The access token is pushed into the API
 * client so authenticated/admin requests carry the Authorization header.
 */

import { getSupabase } from "@/lib/supabase";
import { setAuthToken, setAuthTokenProvider } from "@/services/api";

/**
 * Return the access token of the live Supabase session, auto-refreshing it if
 * expired. Used both by session restore and by the API layer to re-sync its
 * bearer token after an auth rejection.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Let the API layer pull a fresh token without importing Supabase itself
// (avoids a circular module dependency: lib/auth -> services/api -> lib/auth).
setAuthTokenProvider(getFreshAccessToken);

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
  const token = await getFreshAccessToken();
  setAuthToken(token);
  return token;
}

/**
 * Mirror Supabase auth events (SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT) into
 * the API client's bearer token and notify the listener so React state can
 * follow — e.g. automatic access-token refreshes or cross-tab sign-in/out.
 * Returns an unsubscribe function; a no-op when Supabase isn't configured.
 */
export function subscribeToAuthChanges(
  onSession: (accessToken: string | null) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    const accessToken = session?.access_token ?? null;
    setAuthToken(accessToken);
    onSession(accessToken);
  });
  return () => subscription.unsubscribe();
}

export async function signOut() {
  const supabase = getSupabase();
  setAuthToken(null);
  if (supabase) await supabase.auth.signOut();
}

export function isAuthAvailable() {
  return getSupabase() !== null;
}
