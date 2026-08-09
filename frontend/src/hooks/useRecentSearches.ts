/**
 * Recent searches hook (Phase 7) — localStorage-backed, no sensitive data.
 *
 * Stores the last N search terms (station name / brand / city / fuel), most
 * recent first. Terms are plain text only — never coordinates, tokens or
 * user identity. Safe to call from any client component.
 */

import { useCallback, useEffect, useState } from "react";

export interface RecentSearch {
  id: string;
  term: string;
  /** What the term filters: station name, brand, city, or a fuel code. */
  kind: "name" | "brand" | "city" | "fuel";
  at: string;
}

const STORAGE_KEY = "fsf.recent_searches.v1";
const MAX_ENTRIES = 8;

function read(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSearch[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s) => s && typeof s.term === "string" && typeof s.kind === "string",
    );
  } catch {
    return [];
  }
}

function write(entries: RecentSearch[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full/unavailable (private mode) — recent searches degrade silently.
  }
}

export function useRecentSearches() {
  const [searches, setSearches] = useState<RecentSearch[]>([]);

  useEffect(() => {
    setSearches(read());
  }, []);

  const recordSearch = useCallback(
    (term: string, kind: RecentSearch["kind"]) => {
      const trimmed = term.trim();
      if (!trimmed) return;
      setSearches((prev) => {
        const next = [
          { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, term: trimmed, kind, at: new Date().toISOString() },
          ...prev.filter(
            (s) => !(s.kind === kind && s.term.toLowerCase() === trimmed.toLowerCase()),
          ),
        ].slice(0, MAX_ENTRIES);
        write(next);
        return next;
      });
    },
    [],
  );

  const clearSearches = useCallback(() => {
    setSearches([]);
    write([]);
  }, []);

  return { searches, recordSearch, clearSearches };
}
