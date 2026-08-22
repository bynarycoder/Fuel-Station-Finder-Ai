/**
 * React Query hook for the signed-in user's own reports (every status).
 */

import { useQuery } from "@tanstack/react-query";

import { fetchMyReports } from "@/services/api";

export const MY_REPORTS_QUERY_KEY = ["reports", "mine"] as const;

export function useMyReports(enabled = true) {
  return useQuery({
    queryKey: MY_REPORTS_QUERY_KEY,
    queryFn: () => fetchMyReports({ page_size: 50 }),
    enabled,
  });
}
