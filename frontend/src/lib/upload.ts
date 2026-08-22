/**
 * Client-side validation for report photo uploads.
 *
 * The rules here MIRROR the backend (`app/services/storage.py`) instead of
 * inventing new ones:
 * - allowed types: JPEG, PNG, WebP;
 * - maximum size: 5 MiB (`MAX_UPLOAD_BYTES`);
 * - empty files are rejected.
 *
 * Validating in the browser does not replace the server checks (the backend
 * still sniffs magic bytes and enforces the cap) — it just turns a doomed
 * upload into an immediate, actionable message instead of a failed submission.
 */

/** Maximum upload size accepted by the backend: 5 MiB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Image types the backend stores (declared type must match the content). */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** The `accept` attribute for the file input, derived from the same list. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");

export type PhotoValidation = { ok: true; file: File } | { ok: false; error: string };

function formatMib(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/**
 * Validate a user-selected photo before it is attached to a report.
 *
 * Returns a discriminated union so callers cannot forget to handle the error
 * case (an invalid file is never silently accepted).
 */
export function validatePhotoFile(file: File | null | undefined): PhotoValidation {
  if (!file) {
    return { ok: false, error: "No file was selected. Choose a photo to attach." };
  }

  const type = (file.type || "").toLowerCase();
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type)) {
    return {
      ok: false,
      error: "That file type isn't supported. Choose a JPEG, PNG or WebP photo.",
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      error: "That file is empty or unreadable. Try taking the photo again.",
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That photo is ${formatMib(file.size)}. The maximum is ${formatMib(
        MAX_UPLOAD_BYTES,
      )} — choose a smaller image.`,
    };
  }

  return { ok: true, file };
}
