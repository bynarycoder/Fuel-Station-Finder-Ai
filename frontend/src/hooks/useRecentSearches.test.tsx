/**
 * Unit tests for the recent-searches hook (Phase 7) — localStorage-backed.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useRecentSearches } from "@/hooks/useRecentSearches";

const KEY = "fsf.recent_searches.v1";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("useRecentSearches", () => {
  it("records searches newest-first without duplicates", () => {
    const { result } = renderHook(() => useRecentSearches());

    act(() => result.current.recordSearch("NNPC", "brand"));
    act(() => result.current.recordSearch("Lagos", "city"));
    act(() => result.current.recordSearch("NNPC", "brand")); // duplicate

    expect(result.current.searches).toHaveLength(2);
    expect(result.current.searches[0]).toMatchObject({ term: "NNPC", kind: "brand" });
    expect(result.current.searches[1]).toMatchObject({ term: "Lagos", kind: "city" });
  });

  it("persists to localStorage and restores on mount", () => {
    const first = renderHook(() => useRecentSearches());
    act(() => first.result.current.recordSearch("Ikeja", "city"));
    first.unmount();

    const second = renderHook(() => useRecentSearches());
    expect(second.result.current.searches).toEqual([
      expect.objectContaining({ term: "Ikeja", kind: "city" }),
    ]);
  });

  it("ignores blank terms", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.recordSearch("   ", "name"));
    expect(result.current.searches).toHaveLength(0);
  });

  it("clears history", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.recordSearch("Ikeja", "city"));
    act(() => result.current.clearSearches());
    expect(result.current.searches).toHaveLength(0);
    expect(window.localStorage.getItem(KEY)).toBe("[]");
  });

  it("caps the number of stored entries", () => {
    const { result } = renderHook(() => useRecentSearches());
    for (let i = 0; i < 12; i += 1) {
      act(() => result.current.recordSearch(`term-${i}`, "name"));
    }
    expect(result.current.searches.length).toBeLessThanOrEqual(8);
  });
});
