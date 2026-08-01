"use client";

/**
 * App-wide auth state for normal users (drivers). Restores any existing
 * Supabase session on mount, exposes the current user (via /auth/me), and
 * provides sign-in / sign-out. Reused by the report-submission flow, which the
 * backend requires to be authenticated.
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchCurrentUser } from "@/services/api";
import {
  isAuthAvailable,
  restoreSession,
  signInWithEmail,
  signOut as supabaseSignOut,
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
    return () => {
      active = false;
    };
  }, []);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchCurrentUser,
    enabled: !!token,
    retry: false,
  });
  const queryClient = useQueryClient();

  async function signIn(email: string, password: string) {
    const data = await signInWithEmail(email, password);
    setToken(data.session?.access_token ?? null);
    await me.refetch();
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
    signOut,
  };
}
