"use client";

/**
 * React Query hook for a single station's reports (used by the station detail
 * view to show the latest reported price).
 */

import { useQuery } from "@tanstack/react-query";

import { fetchStationReports } from "@/services/api";

export function useStationReports(
  stationId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["reports", "station", stationId],
    queryFn: () => fetchStationReports(stationId as string),
    enabled: !!stationId && enabled,
  });
}
