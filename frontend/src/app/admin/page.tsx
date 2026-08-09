"use client";

/**
 * Admin dashboard (Phase 9): analytics overview, report moderation and user
 * management. Gated behind Supabase auth + an Admin role check.
 *
 * In production (Supabase configured with an admin user) you sign in here; in
 * local dev without Supabase it shows a friendly "not configured" state.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

import { useAdminAnalytics, useAdminReports, useAdminUsers, useSetReportStatus, useUpdateUser, useVerifyReport } from "@/hooks/useAdmin";
import { fetchCurrentUser, type VerificationResult } from "@/services/api";
import { confidenceLabel, formatConfidencePercent } from "@/lib/confidence";
import { isAuthAvailable, restoreSession, signInWithEmail, signOut } from "@/lib/auth";
import type { AdminAnalytics } from "@/types/admin";
import type { User } from "@/types/user";
import { QUEUE_LENGTH_LABELS, type FuelReport } from "@/types/report";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  verified: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    restoreSession()
      .then(setToken)
      .finally(() => setRestoring(false));
  }, []);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchCurrentUser,
    enabled: !!token,
    retry: false,
  });

  const isAdmin = !!me.data && me.data.role === "admin";

  const analytics = useAdminAnalytics(isAdmin);
  const reports = useAdminReports(isAdmin);
  const users = useAdminUsers(isAdmin);
  const statusMutation = useSetReportStatus();
  const userMutation = useUpdateUser();
  const verifyMutation = useVerifyReport();

  if (restoring) {
    return <CenteredNotice icon={<Loader2 className="h-6 w-6 animate-spin" />} text="Loading…" />;
  }

  if (!token) {
    return (
      <SignInGate
        onSignedIn={(t) => {
          setToken(t);
          void me.refetch();
        }}
      />
    );
  }

  if (me.isLoading) {
    return <CenteredNotice icon={<Loader2 className="h-6 w-6 animate-spin" />} text="Verifying access…" />;
  }

  if (me.isError || !isAdmin) {
    return (
      <CenteredNotice
        icon={<ShieldAlert className="h-8 w-8 text-red-500" />}
        text="You need an Admin account to view this dashboard."
        action={
          <button
            onClick={async () => {
              await signOut();
              setToken(null);
            }}
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        }
      />
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b-4 border-amber-500 bg-emerald-900 px-4 py-3 text-white sm:px-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-amber-400" />
          <div>
            <h1 className="text-base font-bold sm:text-lg">Admin Dashboard</h1>
            <p className="text-[11px] text-emerald-200">Signed in as {me.data.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-200 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Map
          </Link>
          <button
            onClick={async () => {
              await signOut();
              setToken(null);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-950"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
        <AnalyticsSection data={analytics.data} loading={analytics.isLoading} />

        <ReportsSection
          reports={reports.data?.items ?? []}
          loading={reports.isLoading}
          onStatus={(id, status) => statusMutation.mutate({ id, status })}
          busy={statusMutation.isPending || verifyMutation.isPending}
          onVerify={verifyMutation.mutate}
          verifyResult={verifyMutation.data}
          verifyError={verifyMutation.error}
          verifyPending={verifyMutation.isPending}
        />

        <UsersSection
          users={users.data?.items ?? []}
          loading={users.isLoading}
          onToggleActive={(id, active) =>
            userMutation.mutate({ id, body: { is_active: active } })
          }
          busy={userMutation.isPending}
        />
      </div>
    </main>
  );
}

// --------------------------------------------------------------------------- #
function SignInGate({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isAuthAvailable()) {
    return (
      <CenteredNotice
        icon={<ShieldAlert className="h-8 w-8 text-amber-500" />}
        text="Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_* to sign in as an admin."
      />
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await signInWithEmail(email, password);
      const t = data.session?.access_token;
      if (t) onSignedIn(t);
    } catch {
      setError("Sign-in failed. Check your credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-emerald-700" />
          <h1 className="text-lg font-bold text-gray-900">Admin sign in</h1>
        </div>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <Link href="/" className="block text-center text-xs text-gray-500 hover:underline">
          ← Back to map
        </Link>
      </form>
    </main>
  );
}

function CenteredNotice({
  icon,
  text,
  action,
}: {
  icon: React.ReactNode;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-gray-50 p-4 text-center">
      {icon}
      <p className="max-w-sm text-sm font-medium text-gray-700">{text}</p>
      {action}
    </main>
  );
}

// --------------------------------------------------------------------------- #
function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function AnalyticsSection({
  data,
  loading,
}: {
  data: AdminAnalytics | undefined;
  loading: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-gray-900">Platform overview</h2>
      {loading || !data ? (
        <p className="text-sm text-gray-400">Loading analytics…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Stations" value={data.stations.total} accent />
          <Stat label="Active stations" value={data.stations.active} />
          <Stat label="Reports" value={data.reports.total} accent />
          <Stat label="Pending reports" value={data.reports.by_status.pending ?? 0} />
          <Stat label="Verified" value={data.reports.by_status.verified ?? 0} />
          <Stat label="Rejected" value={data.reports.by_status.rejected ?? 0} />
          <Stat label="Users" value={data.users.total} accent />
          <Stat label="Admins" value={data.users.by_role.admin ?? 0} />
        </div>
      )}
    </section>
  );
}

function ReportsSection({
  reports,
  loading,
  onStatus,
  onVerify,
  verifyResult,
  verifyError,
  verifyPending,
  busy,
}: {
  reports: FuelReport[];
  loading: boolean;
  onStatus: (id: string, status: string) => void;
  onVerify: (reportId: string) => void;
  verifyResult: VerificationResult | null | undefined;
  verifyError: unknown;
  verifyPending: boolean;
  busy: boolean;
}) {
  // Which report the current AI result/error belongs to (the mutation is
  // shared across reports, so we track the id it was started for).
  const [verifiedReportId, setVerifiedReportId] = useState<string | null>(null);

  function runVerify(reportId: string) {
    setVerifiedReportId(reportId);
    onVerify(reportId);
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-gray-900">Report moderation</h2>
      {loading ? (
        <p className="text-sm text-gray-400">Loading reports…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-gray-400">No reports.</p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <>
            <div
              key={report.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {report.station.brand ? `${report.station.brand} · ` : ""}
                  {report.station.name} · <span className="text-gray-500">{report.fuel_type.code}</span>
                </p>
                <p className="text-xs text-gray-500">
                  {report.queue_length ? QUEUE_LENGTH_LABELS[report.queue_length] : ""}
                  {report.price_per_litre != null ? ` · ₦${report.price_per_litre}/L` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[report.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {report.status}
                </span>
                {report.ai_confidence_score != null && (
                  <span
                    className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700"
                    title={`AI confidence ${formatConfidencePercent(report.ai_confidence_score) ?? "—"} — ${confidenceLabel(report.ai_confidence_score) ?? "n/a"}`}
                  >
                    AI {formatConfidencePercent(report.ai_confidence_score)}
                  </span>
                )}
                {report.photo_url && report.status === "pending" && (
                  <button
                    disabled={verifyPending}
                    onClick={() => runVerify(report.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                    title="Run Gemini photo verification (score + detected attributes)"
                  >
                    {verifyPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Verify with AI
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => onStatus(report.id, "verified")}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                </button>
                <button
                  disabled={busy}
                  onClick={() => onStatus(report.id, "rejected")}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
            </div>

            {/* Inline AI verification result */}
            {verifyResult && report.id === verifiedReportId && (
              <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-2.5 text-xs">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-violet-900">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI verification: {formatConfidencePercent(verifyResult.score)} confidence
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      verifyResult.is_plausible
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {verifyResult.is_plausible ? "Plausible" : "Not plausible"}
                  </span>
                </p>
                {verifyResult.summary && (
                  <p className="mt-1 text-violet-800">{verifyResult.summary}</p>
                )}
                {verifyResult.detected_attributes.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {verifyResult.detected_attributes.map((attr) => (
                      <span
                        key={attr}
                        className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200"
                      >
                        {attr}
                      </span>
                    ))}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-violet-600">
                  Result status: <strong>{verifyResult.report_status}</strong> —
                  scores ≥90% auto-promote to verified.
                </p>
              </div>
            )}
            {verifyError && report.id === verifiedReportId && (
              <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs font-medium text-red-700">
                AI verification failed:{" "}
                {verifyError instanceof Error ? verifyError.message : "unknown error"}
              </p>
            )}
            </>
          ))}
      </div>
      )}
    </section>
  );
}

function UsersSection({
  users,
  loading,
  onToggleActive,
  busy,
}: {
  users: User[];
  loading: boolean;
  onToggleActive: (id: string, active: boolean) => void;
  busy: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-gray-900">Users</h2>
      {loading ? (
        <p className="text-sm text-gray-400">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-gray-400">No users.</p>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {user.email} <span className="font-normal text-gray-500">· {user.role}</span>
                </p>
                <p className="text-xs text-gray-500">
                  {user.is_active ? "Active" : "Disabled"}
                </p>
              </div>
              <button
                disabled={busy}
                onClick={() => onToggleActive(user.id, !user.is_active)}
                className={`rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-50 ${user.is_active ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-emerald-700 text-white hover:bg-emerald-800"}`}
              >
                {user.is_active ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
