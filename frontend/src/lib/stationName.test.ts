/**
 * Station name/brand de-duplication.
 *
 * Real imported rows often repeat the brand inside the name; the UI must not
 * render "A.A. Rano A.A. Rano".
 */

import { describe, expect, it } from "vitest";

import { stationLabel, stationNameParts } from "@/lib/stationName";

describe("stationNameParts", () => {
  it("keeps a brand that adds information", () => {
    const parts = stationNameParts("NNPC", "Ikorodu Road Station");
    expect(parts.brandPrefix).toBe("NNPC");
    expect(parts.name).toBe("Ikorodu Road Station");
    expect(parts.label).toBe("NNPC Ikorodu Road Station");
  });

  it("drops a brand identical to the name", () => {
    const parts = stationNameParts("A.A. Rano", "A.A. Rano");
    expect(parts.brandPrefix).toBeNull();
    expect(parts.label).toBe("A.A. Rano");
  });

  it("drops a brand the name already leads with", () => {
    const parts = stationNameParts("A.A. Rano", "A.A. Rano Ikorodu Road");
    expect(parts.brandPrefix).toBeNull();
    expect(parts.name).toBe("A.A. Rano Ikorodu Road");
    expect(parts.label).toBe("A.A. Rano Ikorodu Road");
  });

  it("ignores case and extra whitespace when comparing", () => {
    expect(stationNameParts("nnpc", "NNPC  Mega Station").brandPrefix).toBeNull();
  });

  it("handles a missing brand", () => {
    const parts = stationNameParts(null, "Unbranded Station");
    expect(parts.brandPrefix).toBeNull();
    expect(parts.label).toBe("Unbranded Station");
  });

  it("does not drop a brand that merely shares a prefix word", () => {
    // "NNPC" must not swallow "NNPCX" style names.
    expect(stationNameParts("NNPC", "NNPCX Filling").brandPrefix).toBe("NNPC");
  });

  it("exposes a single clean label for aria and titles", () => {
    expect(stationLabel("Mobil", "Lekki Phase 1")).toBe("Mobil Lekki Phase 1");
    expect(stationLabel("Mobil", "Mobil Lekki")).toBe("Mobil Lekki");
  });
});
