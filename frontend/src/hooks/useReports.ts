/**
 * React Query hook for the public reports feed (Phase 6/7).
 */

import { useQuery } from "@tanstack/react-query";

import { fetchReports } from "@/services/api";

/** Query key namespace consumed by the realtime invalidation hook. */
export const REPORTS_QUERY_KEY = ["reports"] as const;

export function useReports(stationId?: string) {
  return useQuery({
    queryKey: stationId ? [...REPORTS_QUERY_KEY, stationId] : REPORTS_QUERY_KEY,
    queryFn: () =>
      fetchReports({
        station_id: stationId,
        page_size: 30,
      }),
    // Poll as a fallback when Supabase Realtime isn't configured (local dev).
    refetchInterval: (query) =>
      query.state.data ? 30_000 : false,
  });
}
