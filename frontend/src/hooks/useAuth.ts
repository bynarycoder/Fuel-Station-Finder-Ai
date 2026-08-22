"use client";

/**
 * App-wide auth state for normal users (drivers). Restores any existing
 * Supabase session on mount, exposes the current user (via /auth/me), and
 * provides sign-in / sign-out. Reused by the report-submission flow, which the
 * backend requires to be authenticated.
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabase } from "@/lib/supabase";
import { fetchCurrentUser } from "@/services/api";
import {
  isAuthAvailable,
  restoreSession,
  signInWithEmail,
  signUpWithEmail,
  signOut as supabaseSignOut,
  subscribeToAuthChanges,
} from "@/lib/auth";

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    restoreSession().then((t) => {
      if (active) {
        setToken(t);
        setReady(true);
      }
    });
    // Follow Supabase auth events (token refreshes, cross-tab sign-in/out) so
    // the API client's bearer token and this hook's state never go stale.
    const unsubscribe = subscribeToAuthChanges((t) => {
      if (active) setToken(t);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchCurrentUser,
    enabled: !!token,
    // Transient failures (cold-starting backend, timed-out CORS preflight)
    // must not leave an authenticated user looking signed out — retry a
    // bounded number of times with backoff.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });
  const queryClient = useQueryClient();

  async function signIn(email: string, password: string) {
    const data = await signInWithEmail(email, password);
    setToken(data.session?.access_token ?? null);
    await me.refetch();
  }

  /**
   * Register a new driver via Supabase Auth. Returns metadata describing
   * whether the user is immediately signed in or must confirm their email.
   * When a session is created immediately the local ``users`` row is
   * JIT-provisioned by the backend as a ``driver`` (never admin).
   */
  async function signUp(
    email: string,
    password: string,
  ): Promise<{ isSignedIn: boolean; requiresEmailConfirmation: boolean }> {
    const result = await signUpWithEmail(email, password);
    if (result.isSignedIn) {
      // signUpWithEmail already pushed the access token into the API client;
      // mirror it into hook state so the /auth/me profile fetch runs.
      const supabase = getSupabase();
      const { data } = await (supabase?.auth.getSession() ??
        Promise.resolve({ data: { session: null } }));
      const accessToken = data.session?.access_token ?? null;
      setToken(accessToken);
      if (accessToken) await me.refetch();
    }
    return {
      isSignedIn: result.isSignedIn,
      requiresEmailConfirmation: result.requiresEmailConfirmation,
    };
  }

  async function signOut() {
    await supabaseSignOut();
    setToken(null);
    queryClient.removeQueries({ queryKey: ["me"] });
  }

  return {
    ready,
    user: me.data ?? null,
    isAuthed: !!me.data,
    isAuthAvailable: isAuthAvailable(),
    signIn,
    signUp,
    signOut,
  };
}
