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
import { Loader2, MailCheck, ShieldAlert } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DialogHeader } from "@/components/ui/Sheet";
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
  const { t } = useTranslation();
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
    if (!email.trim()) return t("auth.emailRequired");
    // A simple, friendly email shape check; Supabase performs the real one.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return t("auth.emailInvalid");
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return t("auth.passwordTooShort", { count: MIN_PASSWORD_LENGTH });
    }
    if (mode === "signup" && password !== confirmPassword) {
      return t("auth.passwordMismatch");
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
          setNotice(t("auth.accountCreated"));
          setPassword("");
          setConfirmPassword("");
        }
        // When a session is returned immediately the parent closes the modal
        // and refreshes the user as part of onSignUp's resolution.
      }
    } catch (err) {
      setError(humanizeAuthError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <DialogHeader
        title={mode === "signin" ? t("auth.signIn") : t("auth.createAccount")}
        titleId="auth-modal-title"
        subtitle={
          mode === "signin"
            ? t("auth.signInSubtitle")
            : t("auth.signUpSubtitle")
        }
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto p-4">
        {!isAuthAvailable() ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ShieldAlert className="h-8 w-8 text-warning" aria-hidden="true" />
            <p className="max-w-xs text-body-sm text-ink-600">
              {t("auth.unavailableBefore")}{" "}
              <code>NEXT_PUBLIC_SUPABASE_*</code> {t("auth.unavailableAfter")}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-ink-100 p-1" role="tablist">
              <button
                type="button"
                onClick={() => switchMode("signin")}
                role="tab"
                aria-selected={mode === "signin"}
                className={`h-10 rounded-md text-body-sm font-semibold transition-colors ${
                  mode === "signin"
                    ? "bg-surface text-brand-700 shadow-e1"
                    : "text-ink-500 hover:text-ink-700"
                }`}
              >
                {t("auth.signIn")}
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                role="tab"
                aria-selected={mode === "signup"}
                className={`h-10 rounded-md text-body-sm font-semibold transition-colors ${
                  mode === "signup"
                    ? "bg-surface text-brand-700 shadow-e1"
                    : "text-ink-500 hover:text-ink-700"
                }`}
              >
                {t("auth.signUp")}
              </button>
            </div>

            {notice ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <MailCheck className="h-8 w-8 text-brand-600" aria-hidden="true" />
                <p className="max-w-xs text-body-sm text-ink-700">{notice}</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => switchMode("signin")}
                >
                  {t("auth.backToSignIn")}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-caption text-ink-500">
                  {mode === "signin"
                    ? t("auth.signInIntro")
                    : t("auth.signUpIntro")}
                </p>
                <label className="block">
                  <span className="mb-1.5 block text-body-sm font-semibold text-ink-800">
                    {t("auth.email")}
                  </span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-body-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 pointer-coarse:text-[16px]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-body-sm font-semibold text-ink-800">
                    {t("auth.password")}
                  </span>
                  <input
                    type="password"
                    required
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-body-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 pointer-coarse:text-[16px]"
                  />
                </label>
                {mode === "signup" && (
                  <label className="block">
                    <span className="mb-1.5 block text-body-sm font-semibold text-ink-800">
                      {t("auth.confirmPassword")}
                    </span>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-body-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 pointer-coarse:text-[16px]"
                    />
                  </label>
                )}
                {error && (
                  <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2.5 text-body-sm font-medium text-danger-strong">
                    {error}
                  </p>
                )}
                <Button type="submit" size="lg" disabled={busy} className="w-full">
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {mode === "signin"
                        ? t("auth.signingIn")
                        : t("auth.creatingAccount")}
                    </>
                  ) : mode === "signin" ? (
                    t("auth.signIn")
                  ) : (
                    t("auth.createAccount")
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
function humanizeAuthError(err: unknown, t: TFunction): string {
  const message = err instanceof Error ? err.message : "";
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return t("auth.errorInvalidCredentials");
  }
  if (lower.includes("email not confirmed")) {
    return t("auth.errorEmailNotConfirmed");
  }
  if (lower.includes("user already registered") || lower.includes("already been registered")) {
    return t("auth.errorAlreadyRegistered");
  }
  if (lower.includes("password")) {
    return message || t("auth.errorPassword");
  }
  if (lower.includes("email")) {
    return message || t("auth.errorEmail");
  }
  return message || t("auth.errorGeneric");
}
