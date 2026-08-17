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
  Clock3,
  Loader2,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

import { useAdminAnalytics, useAdminReports, useAdminUsers, useSetReportStatus, useUpdateUser, useVerifyReport } from "@/hooks/useAdmin";
import { fetchCurrentUser, resolveMediaUrl, type VerificationResult } from "@/services/api";
import { confidenceLabel, formatConfidencePercent } from "@/lib/confidence";
import { stationLabel } from "@/lib/stationName";
import { isAuthAvailable, restoreSession, signInWithEmail, signOut } from "@/lib/auth";
import type { AdminAnalytics } from "@/types/admin";
import type { User } from "@/types/user";
import { QUEUE_LENGTH_LABELS, REPORT_STATUS_LABELS, type FuelReportAdmin } from "@/types/report";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning-soft text-warning-strong border border-warning-border",
  under_review: "bg-info-soft text-info-strong border border-info-border",
  verified: "bg-success-soft text-success-strong border border-success-border",
  rejected: "bg-danger-soft text-danger-strong border border-danger-border",
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
        icon={<ShieldAlert className="h-8 w-8 text-danger" aria-hidden="true" />}
        text="You need an Admin account to view this dashboard."
        action={
          <button
            onClick={async () => {
              await signOut();
              setToken(null);
            }}
            className="mt-2 inline-flex h-11 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-4 text-body-sm font-semibold text-ink-800 shadow-e1 transition-colors hover:bg-ink-50"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        }
      />
    );
  }

  return (
    <main className="min-h-[100dvh] bg-canvas">
      <header className="flex h-16 items-center justify-between gap-3 border-b border-white/10 bg-slab px-4 text-white sm:px-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-accent-300" aria-hidden="true" />
          <div>
            <h1 className="text-h2 text-white">Admin dashboard</h1>
            <p className="text-caption text-slab-muted">Signed in as {me.data.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-body-sm font-semibold text-slab-muted transition-colors hover:bg-surface/10 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Map
          </Link>
          <button
            onClick={async () => {
              await signOut();
              setToken(null);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/15 bg-surface/10 px-3 text-body-sm font-semibold text-white transition-colors hover:bg-surface/20"
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
          onStatus={(id, status, options) =>
            statusMutation.mutate({ id, status, ...options })
          }
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
        icon={<ShieldAlert className="h-8 w-8 text-warning" aria-hidden="true" />}
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
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-hairline bg-surface p-6 shadow-e2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-brand-700" aria-hidden="true" />
          <h1 className="text-h1 text-ink-900">Admin sign in</h1>
        </div>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-body-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-body-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        {error && (
          <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-caption font-medium text-danger-strong">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-action text-body-sm font-semibold text-action-fg shadow-e1 transition-colors hover:bg-brand-800 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <Link href="/" className="block text-center text-caption text-ink-500 hover:underline">
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
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-canvas p-4 text-center">
      {icon}
      <p className="max-w-sm text-body text-ink-700">{text}</p>
      {action}
    </main>
  );
}

// --------------------------------------------------------------------------- #
function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-brand-200 bg-brand-50" : "border-hairline bg-surface"}`}>
      <p className="text-label uppercase text-ink-500">{label}</p>
      <p className="mt-1 text-display tabular-nums text-ink-900">{value}</p>
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
      <h2 className="mb-3 text-sm font-bold text-ink-900">Platform overview</h2>
      {loading || !data ? (
        <p className="text-sm text-ink-500">Loading analytics…</p>
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
  reports: FuelReportAdmin[];
  loading: boolean;
  onStatus: (
    id: string,
    status: string,
    options?: { rejectionReason?: string; reviewerNotes?: string },
  ) => void;
  onVerify: (reportId: string) => void;
  verifyResult: VerificationResult | null | undefined;
  verifyError: unknown;
  verifyPending: boolean;
  busy: boolean;
}) {
  // Which report the current AI result/error belongs to (the mutation is
  // shared across reports, so we track the id it was started for).
  const [verifiedReportId, setVerifiedReportId] = useState<string | null>(null);
  // Rejection requires a reason (enforced by the backend too) — track which
  // report is being rejected and the draft reason.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  function runVerify(reportId: string) {
    setVerifiedReportId(reportId);
    onVerify(reportId);
  }

  function confirmReject(reportId: string) {
    onStatus(reportId, "rejected", { rejectionReason: rejectReason.trim() });
    setRejectingId(null);
    setRejectReason("");
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-ink-900">Report moderation</h2>
      {loading ? (
        <p className="text-sm text-ink-500">Loading reports…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-ink-500">No reports.</p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <div key={report.id}>
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-surface p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {stationLabel(report.station.brand, report.station.name)} · <span className="text-ink-500">{report.fuel_type.code}</span>
                </p>
                <p className="text-xs text-ink-500">
                  {report.queue_length ? QUEUE_LENGTH_LABELS[report.queue_length] : ""}
                  {report.price_per_litre != null ? ` · ₦${report.price_per_litre}/L` : ""}
                  {report.notes ? ` · ${report.notes}` : ""}
                </p>
                {report.rejection_reason && (
                  <p className="mt-1 rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger-strong">
                    Rejection reason: {report.rejection_reason}
                  </p>
                )}
                {report.reviewer_notes && (
                  <p className="mt-1 text-[11px] text-ink-500">
                    Reviewer notes: {report.reviewer_notes}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[report.status] ?? "bg-ink-100 text-ink-600"}`}>
                  {REPORT_STATUS_LABELS[report.status] ?? report.status}
                </span>
                {report.ai_confidence_score != null && (
                  <span
                    className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-bold text-info-strong"
                    title={`AI confidence ${formatConfidencePercent(report.ai_confidence_score) ?? "—"} — ${confidenceLabel(report.ai_confidence_score) ?? "n/a"}`}
                  >
                    AI {formatConfidencePercent(report.ai_confidence_score)}
                  </span>
                )}
                {report.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveMediaUrl(report.photo_url) ?? undefined}
                    alt="Reported evidence"
                    loading="lazy"
                    className="h-12 w-12 rounded-lg border border-hairline object-cover"
                    title="Open the reported photo (evidence)"
                    onClick={() => {
                      const url = resolveMediaUrl(report.photo_url);
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  />
                )}
                {report.photo_url && report.status === "pending" && (
                  <button
                    disabled={verifyPending}
                    onClick={() => runVerify(report.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-info px-2 py-1 text-xs font-semibold text-white hover:bg-info-strong disabled:opacity-50"
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
                {report.status !== "verified" && (
                  <button
                    disabled={busy}
                    onClick={() => onStatus(report.id, "verified")}
                    className="inline-flex items-center gap-1 rounded-lg bg-action px-2 py-1 text-xs font-semibold text-action-fg hover:bg-brand-800 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                )}
                {report.status !== "under_review" && report.status !== "rejected" && (
                  <button
                    disabled={busy}
                    onClick={() => onStatus(report.id, "under_review")}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                    title="Mark as being reviewed"
                  >
                    <Clock3 className="h-3.5 w-3.5" /> Under review
                  </button>
                )}
                {rejectingId === report.id ? (
                  <div className="flex w-full flex-col gap-1.5 sm:w-72">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="Rejection reason (shown to the submitter) — required"
                      className="w-full rounded-lg border border-red-300 p-2 text-xs focus:border-red-500 focus:outline-none"
                    />
                    <div className="flex gap-1.5">
                      <button
                        disabled={busy}
                        onClick={() => confirmReject(report.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-danger px-2 py-1 text-xs font-semibold text-white hover:bg-danger-strong disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Confirm rejection
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        className="rounded-lg bg-ink-100 px-2 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    disabled={busy || report.status === "rejected"}
                    onClick={() => {
                      setRejectingId(report.id);
                      setRejectReason(report.rejection_reason ?? "");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-danger px-2 py-1 text-xs font-semibold text-white hover:bg-danger-strong disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                )}
              </div>
            </div>

            {/* Inline AI verification result */}
            {verifyResult && report.id === verifiedReportId ? (
              <div className="mt-2 rounded-lg border border-info-border bg-info-soft p-2.5 text-xs">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-info-strong">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI verification: {formatConfidencePercent(verifyResult.score)} confidence
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      verifyResult.is_plausible
                        ? "bg-success-soft text-success-strong"
                        : "bg-red-100 text-danger-strong"
                    }`}
                  >
                    {verifyResult.is_plausible ? "Plausible" : "Not plausible"}
                  </span>
                </p>
                {verifyResult.summary ? (
                  <p className="mt-1 text-info-strong">{verifyResult.summary}</p>
                ) : null}
                {verifyResult.detected_attributes.length > 0 ? (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {verifyResult.detected_attributes.map((attr) => (
                      <span
                        key={attr}
                        className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-info-strong ring-1 ring-info-border"
                      >
                        {attr}
                      </span>
                    ))}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-info">
                  Result status: <strong>{verifyResult.report_status}</strong> —
                  scores ≥90% auto-promote to verified.
                </p>
              </div>
            ) : null}
            {verifyError && report.id === verifiedReportId ? (
              <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-2 text-xs font-medium text-danger-strong">
                AI verification failed:{" "}
                {verifyError instanceof Error ? verifyError.message : "unknown error"}
              </p>
            ) : null}
            </div>
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
      <h2 className="mb-3 text-sm font-bold text-ink-900">Users</h2>
      {loading ? (
        <p className="text-sm text-ink-500">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-ink-500">No users.</p>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-surface p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {user.email} <span className="font-normal text-ink-500">· {user.role}</span>
                </p>
                <p className="text-xs text-ink-500">
                  {user.is_active ? "Active" : "Disabled"}
                </p>
              </div>
              <button
                disabled={busy}
                onClick={() => onToggleActive(user.id, !user.is_active)}
                className={`rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-50 ${user.is_active ? "bg-ink-100 text-ink-700 hover:bg-ink-200" : "bg-action text-action-fg hover:bg-brand-800"}`}
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
