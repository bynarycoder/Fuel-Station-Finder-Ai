/**
 * Photo validation rules must mirror the backend (`app/services/storage.py`):
 * JPEG/PNG/WebP only, non-empty, at most 5 MiB.
 */

import { describe, expect, it } from "vitest";

import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPT_ATTRIBUTE,
  MAX_UPLOAD_BYTES,
  validatePhotoFile,
} from "@/lib/upload";

function file(name: string, type: string, size: number): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size, configurable: true });
  return f;
}

describe("validatePhotoFile", () => {
  it("mirrors the backend's limit exactly (5 MiB)", () => {
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
  });

  it("accepts the backend's supported image types", () => {
    for (const type of ACCEPTED_IMAGE_TYPES) {
      const result = validatePhotoFile(file(`photo.${type.split("/")[1]}`, type, 1024));
      expect(result.ok).toBe(true);
    }
    expect(ACCEPT_ATTRIBUTE).toBe("image/jpeg,image/png,image/webp");
  });

  it("rejects an unsupported type", () => {
    const result = validatePhotoFile(file("clip.gif", "image/gif", 1024));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JPEG, PNG or WebP/i);
  });

  it("rejects an empty/corrupt file", () => {
    const result = validatePhotoFile(file("broken.png", "image/png", 0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty or unreadable/i);
  });

  it("rejects an oversized file and says how big it was", () => {
    const result = validatePhotoFile(
      file("huge.jpg", "image/jpeg", MAX_UPLOAD_BYTES + 1),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/maximum is 5 MB/i);
  });

  it("accepts a file exactly at the limit", () => {
    expect(validatePhotoFile(file("edge.jpg", "image/jpeg", MAX_UPLOAD_BYTES)).ok).toBe(
      true,
    );
  });

  it("rejects a missing file instead of silently accepting nothing", () => {
    expect(validatePhotoFile(null).ok).toBe(false);
    expect(validatePhotoFile(undefined).ok).toBe(false);
  });
});
