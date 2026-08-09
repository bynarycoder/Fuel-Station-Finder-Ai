/**
 * Unit tests for confidence-score presentation helpers (Phase 10).
 */

import { describe, expect, it } from "vitest";

import {
  confidenceColor,
  confidenceLabel,
  formatConfidencePercent,
} from "@/lib/confidence";

describe("confidenceLabel", () => {
  it("maps 0.90–1.00 to High", () => {
    expect(confidenceLabel(1)).toBe("High");
    expect(confidenceLabel(0.9)).toBe("High");
    expect(confidenceLabel(0.93)).toBe("High");
  });

  it("maps 0.70–0.89 to Medium", () => {
    expect(confidenceLabel(0.89)).toBe("Medium");
    expect(confidenceLabel(0.7)).toBe("Medium");
    expect(confidenceLabel(0.75)).toBe("Medium");
  });

  it("maps below 0.70 to Low", () => {
    expect(confidenceLabel(0.69)).toBe("Low");
    expect(confidenceLabel(0.4)).toBe("Low");
    expect(confidenceLabel(0)).toBe("Low");
  });

  it("returns null for missing scores", () => {
    expect(confidenceLabel(null)).toBeNull();
    expect(confidenceLabel(undefined)).toBeNull();
  });
});

describe("formatConfidencePercent", () => {
  it("formats 0..1 as a percentage", () => {
    expect(formatConfidencePercent(0.87)).toBe("87%");
    expect(formatConfidencePercent(0.995)).toBe("100%");
    expect(formatConfidencePercent(0.04)).toBe("4%");
  });

  it("returns null for missing scores", () => {
    expect(formatConfidencePercent(null)).toBeNull();
  });
});

describe("confidenceColor", () => {
  it("returns emerald/amber/red for High/Medium/Low", () => {
    expect(confidenceColor(0.95)).toContain("emerald");
    expect(confidenceColor(0.8)).toContain("amber");
    expect(confidenceColor(0.5)).toContain("red");
  });
});
