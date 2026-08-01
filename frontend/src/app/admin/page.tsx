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
  XCircle,
} from "lucide-react";

import { useAdminAnalytics, useAdminReports, useAdminUsers, useSetReportStatus, useUpdateUser } from "@/hooks/useAdmin";
import { fetchCurrentUser } from "@/services/api";
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
          busy={statusMutation.isPending}
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
  busy,
}: {
  reports: FuelReport[];
  loading: boolean;
  onStatus: (id: string, status: string) => void;
  busy: boolean;
}) {
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
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[report.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {report.status}
                </span>
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
