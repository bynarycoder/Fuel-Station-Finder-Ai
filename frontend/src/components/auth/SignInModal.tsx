"use client";

/**
 * Email/password authentication modal for normal users (drivers). Backed by
 * Supabase Auth. Offers two modes:
 *
 * - Sign in: existing users authenticate with their email + password.
 * - Sign up: new drivers register. The backend JIT-provisions the local profile
 *   with the default ``driver`` role on first authenticated request, so
 *   registration never grants admin/station-manager privileges.
 *
 * The resulting access token is pushed into the API client by the auth layer,
 * enabling authenticated actions like reporting a price.
 */

import { useState } from "react";
import { Loader2, LogIn, MailCheck, ShieldAlert, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isAuthAvailable } from "@/lib/auth";

type Mode = "signin" | "signup";

interface SignInModalProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  /**
   * Register a new user. Resolves with metadata describing whether a session
   * was created immediately or email confirmation is required.
   */
  onSignUp: (
    email: string,
    password: string,
  ) => Promise<{ isSignedIn: boolean; requiresEmailConfirmation: boolean }>;
  onClose: () => void;
  /** Open the modal in a specific tab ("signin" or "signup"). Defaults to "signin". */
  initialMode?: Mode;
}

// Supabase enforces a 6-character minimum by default; mirror it client-side for
// immediate feedback before the round-trip.
const MIN_PASSWORD_LENGTH = 6;

export function SignInModal({ onSignIn, onSignUp, onClose, initialMode }: SignInModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  function validate(): string | null {
    if (!email.trim()) return "Enter your email address.";
    // A simple, friendly email shape check; Supabase performs the real one.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return "Enter a valid email address.";
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (mode === "signup" && password !== confirmPassword) {
      return "Passwords do not match.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    // Validate inputs before setting busy state
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        await onSignIn(email.trim(), password);
      } else {
        const result = await onSignUp(email.trim(), password);
        if (result.requiresEmailConfirmation) {
          setNotice(
            "Account created. Check your email to confirm your address, then sign in.",
          );
          setPassword("");
          setConfirmPassword("");
        }
        // When a session is returned immediately the parent closes the modal
        // and refreshes the user as part of onSignUp's resolution.
      }
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          {mode === "signin" ? (
            <>
              <LogIn className="h-4 w-4 text-emerald-700" /> Sign in
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4 text-emerald-700" /> Create account
            </>
          )}
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
          <>
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={`rounded-md py-1.5 text-xs font-semibold transition ${
                  mode === "signin"
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`rounded-md py-1.5 text-xs font-semibold transition ${
                  mode === "signup"
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Sign up
              </button>
            </div>

            {notice ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <MailCheck className="h-8 w-8 text-emerald-600" />
                <p className="max-w-xs text-sm text-gray-700">{notice}</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => switchMode("signin")}
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-xs text-gray-500">
                  {mode === "signin"
                    ? "Sign in to report fuel prices and help other drivers."
                    : "Create a driver account to report fuel prices and help other drivers."}
                </p>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-700">
                    Email
                  </span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-gray-700">
                    Password
                  </span>
                  <input
                    type="password"
                    required
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </label>
                {mode === "signup" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-700">
                      Confirm password
                    </span>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </label>
                )}
                {error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {mode === "signin" ? "Signing in…" : "Creating account…"}
                    </>
                  ) : mode === "signin" ? (
                    "Sign in"
                  ) : (
                    "Create account"
                  )}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Translate Supabase Auth error messages into concise, user-facing text. We
 * preserve the server message for known cases and fall back to a generic
 * message so unexpected errors don't dump raw internals into the UI.
 */
function humanizeAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }
  if (lower.includes("user already registered") || lower.includes("already been registered")) {
    return "An account with this email already exists. Try signing in.";
  }
  if (lower.includes("password")) {
    return message || "Password does not meet the requirements.";
  }
  if (lower.includes("email")) {
    return message || "Please enter a valid email address.";
  }
  return (
    message ||
    "Authentication failed. Check your details and try again."
  );
}
