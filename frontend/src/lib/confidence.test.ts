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
  /**
   * Asserts the SEMANTIC contract rather than a specific hue: High/Medium/Low
   * map to the design system's success/warning/danger tones. This survives a
   * palette change (the design-token migration renamed emerald/amber/red to
   * success/warning/danger) while still catching a genuine mis-mapping.
   */
  it("returns success/warning/danger tones for High/Medium/Low", () => {
    expect(confidenceColor(0.95)).toContain("success");
    expect(confidenceColor(0.8)).toContain("warning");
    expect(confidenceColor(0.5)).toContain("danger");
  });

  it("gives each confidence level a visually distinct treatment", () => {
    const high = confidenceColor(0.95);
    const medium = confidenceColor(0.8);
    const low = confidenceColor(0.5);
    expect(new Set([high, medium, low]).size).toBe(3);
  });
});
