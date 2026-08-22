"use client";

/**
 * React Query hooks for the admin dashboard (Phase 9): analytics, report
 * moderation and user management, plus status/user mutations that invalidate
 * the relevant caches.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchAdminAnalytics,
  fetchAdminReports,
  fetchAdminUsers,
  setReportStatus,
  updateUser,
  verifyReport,
} from "@/services/api";

export const ADMIN_KEYS = {
  analytics: ["admin", "analytics"] as const,
  reports: ["admin", "reports"] as const,
  users: ["admin", "users"] as const,
};

export function useAdminAnalytics(enabled = true) {
  return useQuery({
    queryKey: ADMIN_KEYS.analytics,
    queryFn: fetchAdminAnalytics,
    enabled,
  });
}

/** Run Gemini photo verification on a report (admin only — backend enforces). */
export function useVerifyReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) => verifyReport(reportId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.reports });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useAdminReports(enabled = true) {
  return useQuery({
    queryKey: ADMIN_KEYS.reports,
    queryFn: () => fetchAdminReports({ page_size: 50 }),
    enabled,
  });
}

export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: ADMIN_KEYS.users,
    queryFn: () => fetchAdminUsers({ page_size: 50 }),
    enabled,
  });
}

export function useSetReportStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      rejectionReason,
      reviewerNotes,
    }: {
      id: string;
      status: string;
      rejectionReason?: string;
      reviewerNotes?: string;
    }) =>
      setReportStatus(id, status, {
        rejection_reason: rejectionReason,
        reviewer_notes: reviewerNotes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.reports });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.analytics });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["reports", "mine"] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { role?: string; is_active?: boolean };
    }) => updateUser(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.users });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.analytics });
    },
  });
}
