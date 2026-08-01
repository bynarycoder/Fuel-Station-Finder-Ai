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
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      setReportStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.reports });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.analytics });
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
