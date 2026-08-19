import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TAB_PATH, useFinderTabFromUrl } from "@/lib/useFinderPath";
import { mockPathname } from "../../vitest.setup";

describe("useFinderTabFromUrl", () => {
  afterEach(() => {
    mockPathname("/");
  });

  it.each([
    ["/map", "map"],
    ["/stations", "stations"],
    ["/ai", "ai"],
    ["/report", "report"],
    ["/account", "account"],
  ])("maps %s to the %s tab", (path, expected) => {
    mockPathname(path);
    const { result } = renderHook(() => useFinderTabFromUrl());
    expect(result.current).toBe(expected);
  });

  it("defaults to map for the finder root and unknown paths", () => {
    mockPathname("/");
    expect(renderHook(() => useFinderTabFromUrl()).result.current).toBe("map");
    mockPathname("/about");
    expect(renderHook(() => useFinderTabFromUrl()).result.current).toBe("map");
    mockPathname("/random-thing");
    expect(renderHook(() => useFinderTabFromUrl()).result.current).toBe("map");
  });

  it("exposes a stable path for every tab", () => {
    expect(TAB_PATH).toEqual({
      map: "/map",
      stations: "/stations",
      ai: "/ai",
      report: "/report",
      account: "/account",
    });
  });
});
