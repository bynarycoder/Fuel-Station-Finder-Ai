import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  PATH_TO_TAB,
  TAB_PATH,
  tabFromPathname,
  useFinderPathname,
} from "@/lib/useFinderPath";
import { mockPathname } from "../../vitest.setup";

describe("useFinderPath", () => {
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
    const { result } = renderHook(() => useFinderPathname());
    expect(result.current).toBe(path);
    expect(tabFromPathname(result.current)).toBe(expected);
  });

  it("exposes a stable forward and reverse path mapping", () => {
    expect(TAB_PATH).toEqual({
      map: "/map",
      stations: "/stations",
      ai: "/ai",
      report: "/report",
      account: "/account",
    });
    expect(PATH_TO_TAB).toEqual({
      "/map": "map",
      "/stations": "stations",
      "/ai": "ai",
      "/report": "report",
      "/account": "account",
    });
  });

  it("defaults unknown paths and the finder root to map", () => {
    expect(tabFromPathname("")).toBe("map");
    expect(tabFromPathname("/")).toBe("map");
    expect(tabFromPathname("/about")).toBe("map");
    expect(tabFromPathname("/random-thing")).toBe("map");
  });
});
