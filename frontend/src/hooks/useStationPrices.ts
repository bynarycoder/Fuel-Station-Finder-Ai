"use client";

/**
 * Latest reported prices for MANY stations, from ONE request.
 *
 * Station cards need "how much?" and "is it current?" to be answerable without
 * opening the card. Previously only the single "Closest to you" card fetched
 * reports (one request, one card). Fetching per card would be an N+1.
 *
 * Instead we reuse the existing public reports feed (`GET /reports`) — the same
 * endpoint the community feed already polls — and index it by station id.
 * React Query dedupes it with the feed's own usage, so this adds no new
 * backend surface and no extra round-trip per card.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchReports } from "@/services/api";
import { REPORTS_QUERY_KEY } from "@/hooks/useReports";
import {
  EMPTY_STATION_SUMMARY,
  summariseFeedByStation,
  type StationSummary,
} from "@/lib/stationSummary";

/** How many recent reports to index for the card summaries. */
const FEED_PAGE_SIZE = 100;

export function useStationPrices() {
  const query = useQuery({
    queryKey: [...REPORTS_QUERY_KEY, "summary", FEED_PAGE_SIZE],
    queryFn: () => fetchReports({ page_size: FEED_PAGE_SIZE }),
    staleTime: 60_000,
  });

  const byStation = useMemo(
    () => summariseFeedByStation(query.data?.items),
    [query.data],
  );

  return {
    /** Summary for a station id — never null, so cards can render unguarded. */
    summaryFor: (stationId: string): StationSummary =>
      byStation.get(stationId) ?? EMPTY_STATION_SUMMARY,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export type UseStationPrices = ReturnType<typeof useStationPrices>;
