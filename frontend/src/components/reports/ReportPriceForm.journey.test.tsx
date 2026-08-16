/**
 * THE MANDATORY REPORT JOURNEY (spec §44), asserted as ONE continuous
 * scenario rather than as isolated units.
 *
 * The bug this guards against was a sequencing bug: each step behaved
 * correctly in isolation, but performing them in order produced a report that
 * was "submitted" while the user was still choosing a photo. Only an
 * end-to-end walk can catch that class of regression.
 *
 *   1. Open Report
 *   2. Tap Browse Photo
 *   3. File picker opens
 *   4. Select image
 *   5. Preview appears
 *   6. STILL NOT SUBMITTED
 *   7. Tap Remove
 *   8. Image disappears
 *   9. Tap Browse again
 *  10. Select another image
 *  11. Preview updates
 *  12. STILL NOT SUBMITTED
 *  13. Tap Submit Report
 *  14. Exactly ONE API request
 *  15. Wait for the backend
 *  16. Only THEN show success
 *
 * Complements ReportPriceForm.test.tsx (the submit state machine) and
 * ReportPriceForm.mobile.test.tsx (touch ergonomics + a11y).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportPriceForm } from "@/components/reports/ReportPriceForm";
import * as api from "@/services/api";
import type { Station } from "@/types/station";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, submitReport: vi.fn() };
});

const submitMock = vi.mocked(api.submitReport);

const STATION: Station = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "NNPC Retail Wuse",
  brand: "NNPC",
  address: "Wuse 2",
  city: "Abuja",
  state: "FCT",
  phone: null,
  latitude: 9.07,
  longitude: 7.48,
  is_active: true,
  data_source: "seed",
  verification_status: "verified",
  verified_at: null,
  last_verified_at: null,
  source_id: null,
  fuel_types: [{ code: "PMS", name: "Petrol (PMS)" }],
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

function makeReport(id: string) {
  return { id } as unknown as Awaited<ReturnType<typeof api.submitReport>>;
}

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReportPriceForm station={STATION} onClose={vi.fn()} onSuccess={vi.fn()} />
    </QueryClientProvider>,
  );
}

function photoInput(): HTMLInputElement {
  return screen.getByTestId("report-photo-input") as HTMLInputElement;
}

/** jsdom's `files` is read-only — define it, then fire change. */
function selectFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

function makeFile(name: string, type = "image/png", size = 120_000): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

function goToEvidenceStep(price = "915") {
  fireEvent.change(screen.getByLabelText(/price in naira per litre/i), {
    target: { value: price },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

beforeEach(() => {
  submitMock.mockReset();
});

describe("the full report journey (spec §44)", () => {
  it("walks browse → select → remove → reselect → submit, submitting exactly once at the end", async () => {
    // Hold the backend open so we can prove success waits for persistence.
    let resolveSubmit!: (value: Awaited<ReturnType<typeof api.submitReport>>) => void;
    submitMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    // 1. Open Report.
    renderForm();
    goToEvidenceStep();

    // 2 + 3. Tap Browse Photo — this only opens the picker.
    const openPicker = vi.fn();
    photoInput().addEventListener("click", openPicker);
    fireEvent.click(screen.getByText(/browse photos/i));
    expect(openPicker).toHaveBeenCalledTimes(1);
    expect(submitMock).not.toHaveBeenCalled();

    // 4 + 5. Select an image → it is staged and previewed.
    selectFiles(photoInput(), [makeFile("board-1.png")]);
    expect(screen.getByTestId("photo-preview")).toBeInTheDocument();
    expect(screen.getByTestId("photo-pending")).toHaveTextContent("board-1.png");

    // 6. STILL NOT SUBMITTED.
    expect(submitMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/report submitted/i)).not.toBeInTheDocument();

    // 7 + 8. Remove → the image disappears.
    fireEvent.click(screen.getByRole("button", { name: /remove photo board-1\.png/i }));
    expect(screen.queryByTestId("photo-preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("photo-pending")).not.toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();

    // 9 + 10 + 11. Browse again, pick another image, preview updates.
    fireEvent.click(screen.getByText(/browse photos/i));
    selectFiles(photoInput(), [makeFile("board-2.png")]);
    expect(screen.getByTestId("photo-pending")).toHaveTextContent("board-2.png");
    expect(screen.getByTestId("photo-pending")).not.toHaveTextContent("board-1.png");

    // 12. STILL NOT SUBMITTED.
    expect(submitMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/report submitted/i)).not.toBeInTheDocument();

    // 13. Submit.
    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));

    // 14. Exactly ONE request, carrying the SECOND photo.
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        station_id: STATION.id,
        fuel_type_code: "PMS",
        price_per_litre: 915,
        photo: expect.objectContaining({ name: "board-2.png" }),
      }),
    );

    // 15. While in flight: no success yet, and the button is busy/disabled.
    expect(screen.queryByText(/report submitted/i)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled(),
    );

    // 16. Success ONLY after the backend confirms with a persisted id.
    resolveSubmit(makeReport("report-persisted-1"));
    expect(await screen.findByText(/report submitted/i)).toBeInTheDocument();
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it("double-tapping Submit sends exactly one request", async () => {
    let resolveSubmit!: (value: Awaited<ReturnType<typeof api.submitReport>>) => void;
    submitMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    renderForm();
    goToEvidenceStep();
    selectFiles(photoInput(), [makeFile("board.png")]);

    const submit = screen.getByRole("button", { name: /submit price report/i });
    // Two taps in the same tick — faster than React can disable the button.
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    resolveSubmit(makeReport("report-1"));
    await screen.findByText(/report submitted/i);
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it("a rejected file never reaches the API, and the retry after it does", async () => {
    submitMock.mockResolvedValue(makeReport("report-1"));
    renderForm();
    goToEvidenceStep();

    // An oversized file is refused client-side and is not staged.
    selectFiles(photoInput(), [makeFile("huge.png", "image/png", 9_000_000)]);
    expect(screen.getByTestId("photo-error")).toBeInTheDocument();
    expect(screen.queryByTestId("photo-preview")).not.toBeInTheDocument();

    // Submitting while the error stands must not send anything.
    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));
    expect(submitMock).not.toHaveBeenCalled();

    // Choosing a valid file clears the error; submit then works.
    selectFiles(photoInput(), [makeFile("ok.png")]);
    expect(screen.queryByTestId("photo-error")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/report submitted/i)).toBeInTheDocument();
  });

  it("a backend failure never shows success and keeps the staged photo", async () => {
    submitMock.mockRejectedValue(new api.ApiError(500, "Upload failed."));

    renderForm();
    goToEvidenceStep();
    selectFiles(photoInput(), [makeFile("board.png")]);
    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/upload failed/i)).toBeInTheDocument();
    expect(screen.queryByText(/report submitted/i)).not.toBeInTheDocument();
    // The photo survives so the user can simply retry.
    expect(screen.getByTestId("photo-pending")).toHaveTextContent("board.png");
  });
});
