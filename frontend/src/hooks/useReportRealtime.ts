"use client";

/**
 * Subscribes to Supabase Realtime ``postgres_changes`` on ``fuel_reports`` and
 * invalidates the reports query cache whenever a report is inserted or updated,
 * so the UI refreshes instantly (Phase 7).
 *
 * Becomes a no-op when Supabase isn't configured (local development), in which
 * case ``useReports`` falls back to polling.
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getSupabase } from "@/lib/supabase";
import { REPORTS_QUERY_KEY } from "./useReports";

export type RealtimeStatus = "disabled" | "connecting" | "live";

export function useReportRealtime(): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("disabled");

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setStatus("disabled");
      return;
    }

    setStatus("connecting");
    const channel = supabase
      .channel("fuel_reports_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fuel_reports" },
        () => {
          void queryClient.invalidateQueries({ queryKey: REPORTS_QUERY_KEY });
        },
      )
      .subscribe((state) => {
        setStatus(state === "SUBSCRIBED" ? "live" : "connecting");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return status;
}
