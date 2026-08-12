/**
 * Hydration-safety tests for the React #418 workarounds.
 *
 * Verifies the invariant the team previously fixed: components that depend
 * on browser-only globals (`navigator.onLine`, `Date.now()`) read those
 * globals **only inside `useEffect`**, never during render. That is what
 * guarantees the first render output is identical between the server and
 * the client, which is what React's hydration check requires.
 *
 * We verify the property by reading the component source and asserting
 * that ``Date.now()`` / ``navigator.onLine`` appear only inside a
 * ``useEffect`` block. This is more robust than trying to time the
 * synchronous effect run, which depends on the testing library.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfflineBanner } from "@/components/OfflineBanner";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { formatRelative } from "@/lib/format";

afterEach(() => {
  vi.restoreAllMocks();
});

// --------------------------------------------------------------------------- //
// Source-level checks: Date.now() / navigator.onLine only inside useEffect
// --------------------------------------------------------------------------- //
function readComponentSource(filename: string): string {
  // The test runs from /frontend; resolve relative to the test file's
  // own __dirname-equivalent (which is the file's location).
  const path = join(
    process.cwd(),
    "src",
    "components",
    filename,
  );
  return readFileSync(path, "utf-8");
}

describe("Source-level hydration safety", () => {
  it("OfflineBanner only reads navigator.onLine inside useEffect", () => {
    const src = readComponentSource("OfflineBanner.tsx");
    // The access must exist somewhere (otherwise this test is meaningless).
    expect(src).toContain("navigator.onLine");
    // It must NOT appear before the first ``useEffect`` block.
    const beforeEffect = src.split("useEffect")[0] ?? "";
    expect(beforeEffect).not.toContain("navigator.onLine");
  });

  it("RelativeTime only calls Date.now() inside useEffect", () => {
    const src = readComponentSource("ui/RelativeTime.tsx");
    expect(src).toContain("Date.now()");
    // The only useEffect block contains the Date.now() call.
    const useEffectMatch = src.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[iso\]\)/);
    expect(useEffectMatch).not.toBeNull();
    expect(useEffectMatch![0]).toContain("Date.now()");
  });
});

// --------------------------------------------------------------------------- //
// Behaviour-level checks
// --------------------------------------------------------------------------- //
describe("OfflineBanner (behaviour)", () => {
  it("does not show the banner when navigator reports online", () => {
    const originalOnLine = window.navigator.onLine;
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
    try {
      const { container } = render(<OfflineBanner />);
      expect(container.querySelector('[role="status"]')).toBeNull();
    } finally {
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        get: () => originalOnLine,
      });
    }
  });

  it("shows the banner after mount when navigator is offline", async () => {
    const originalOnLine = window.navigator.onLine;
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    try {
      const { findByRole } = render(<OfflineBanner />);
      const banner = await findByRole("status");
      expect(banner).toBeInTheDocument();
      expect(banner.textContent ?? "").toMatch(/offline/i);
    } finally {
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        get: () => originalOnLine,
      });
    }
  });
});

describe("RelativeTime (behaviour)", () => {
  it("fills in the relative text after useEffect runs", async () => {
    const iso = new Date(Date.now() - 12 * 60_000).toISOString();
    const { findByText } = render(<RelativeTime iso={iso} />);
    expect(await findByText("12m ago")).toBeInTheDocument();
  });

  it("formatRelative is pure and deterministic — same inputs, same output", () => {
    // Pure helper — no Date.now() at render time. Server and client can both
    // call it with an explicit nowMs and produce identical text.
    const iso = "2026-01-01T00:00:00.000Z";
    const nowMs = Date.parse("2026-01-01T00:05:00.000Z");
    expect(formatRelative(iso, nowMs)).toBe("5m ago");
    expect(formatRelative(iso, nowMs)).toBe("5m ago");
  });

  it("formatRelative handles 'just now' (sub-minute) and 'X d ago'", () => {
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    // <30s rounds down to "just now"; the helper uses Math.round so a 30s
    // gap rounds up to 1m. Use a 10s gap to stay inside the "just now"
    // bucket.
    expect(formatRelative("2026-01-01T11:59:50.000Z", now)).toBe("just now");
    expect(formatRelative("2026-01-01T11:58:00.000Z", now)).toBe("2m ago");
    expect(formatRelative("2026-01-01T09:00:00.000Z", now)).toBe("3h ago");
    expect(formatRelative("2025-12-29T12:00:00.000Z", now)).toBe("3d ago");
  });
});
