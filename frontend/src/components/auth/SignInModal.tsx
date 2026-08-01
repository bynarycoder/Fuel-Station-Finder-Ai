"use client";

/**
 * Email/password sign-in modal for normal users (drivers). Backed by Supabase
 * Auth; the resulting access token is pushed into the API client by the auth
 * layer, enabling authenticated actions like reporting a price.
 */

import { useState } from "react";
import { Loader2, LogIn, ShieldAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isAuthAvailable } from "@/lib/auth";

interface SignInModalProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onClose: () => void;
}

export function SignInModal({ onSignIn, onClose }: SignInModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSignIn(email, password);
    } catch {
      setError("Sign-in failed. Check your credentials and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <LogIn className="h-4 w-4 text-emerald-700" /> Sign in
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!isAuthAvailable() ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ShieldAlert className="h-8 w-8 text-amber-500" />
            <p className="max-w-xs text-sm text-gray-600">
              Supabase isn&apos;t configured on this environment, so sign-in is
              unavailable. Set <code>NEXT_PUBLIC_SUPABASE_*</code> to enable it.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-gray-500">
              Sign in to report fuel prices and help other drivers.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </label>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
