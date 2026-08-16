/**
 * Report submission + photo upload regression tests.
 *
 * These lock down the state machine that the production bug violated: a report
 * became "submitted" while the user was only choosing an image, and success
 * was shown without the backend ever confirming.
 *
 * Covered (in the order the task specifies):
 *  1. Opening the picker ("Browse") does NOT submit the form.
 *  2. Cancelling the picker does NOT submit (and does not clear the form).
 *  3. Selecting a valid image does NOT submit automatically.
 *  4. A valid image lands in a pending/preview state.
 *  5. Tapping Submit triggers the multipart upload.
 *  6. Report submission waits for the upload to succeed.
 *  7. Upload/backend failure prevents "submitted".
 *  8. Network failure never produces a false success.
 *  9. An invalid file type is rejected client-side (never uploaded).
 * 10. An oversized file is rejected using the backend's 5 MiB limit.
 * 11. Success is only shown after backend confirmation (a persisted id).
 * 12. Double submission cannot create duplicate reports.
 *
 * Plus: implicit form submission (Enter in the price field) can never create a
 * report — that was the mechanism behind the "submitted while browsing" bug.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportPriceForm } from "@/components/reports/ReportPriceForm";
import * as api from "@/services/api";
import { MAX_UPLOAD_BYTES } from "@/lib/upload";
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

function makeReport(id = "report-1") {
  return {
    id,
    station: { id: STATION.id, name: STATION.name, brand: STATION.brand },
    reported_by: { id: "u1", full_name: "Tunde" },
    fuel_type: { code: "PMS", name: "Petrol (PMS)" },
    price_per_litre: 915,
    queue_length: null,
    photo_url: "/media/abc.png",
    notes: null,
    status: "pending",
    created_at: "2026-08-16T10:00:00Z",
    updated_at: "2026-08-16T10:00:00Z",
    ai_confidence_score: null,
    reviewed_at: null,
    rejection_reason: null,
  } as unknown as Awaited<ReturnType<typeof api.submitReport>>;
}

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <QueryClientProvider client={client}>
      <ReportPriceForm station={STATION} onClose={onClose} onSuccess={onSuccess} />
    </QueryClientProvider>,
  );
  return { ...utils, onSuccess, onClose };
}

/** Fill the price and walk to the Evidence step. */
function goToEvidenceStep(price = "915") {
  fireEvent.change(screen.getByLabelText(/price in naira per litre/i), {
    target: { value: price },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

function photoInput(): HTMLInputElement {
  return screen.getByTestId("report-photo-input") as HTMLInputElement;
}

/** jsdom's `files` is read-only — define it, then fire the change event. */
function selectFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

function makeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

const VALID_PHOTO = () => makeFile("queue.png", "image/png", 120_000);

beforeEach(() => {
  submitMock.mockReset();
  submitMock.mockResolvedValue(makeReport());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("browsing for a photo never submits the report", () => {
  it("1. clicking Browse (opening the picker) does not submit", () => {
    renderForm();
    goToEvidenceStep();

    fireEvent.click(photoInput()); // the label/hidden input activation
    expect(submitMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/report submitted/i)).not.toBeInTheDocument();
  });

  it("2. cancelling the picker submits nothing and keeps the form data", () => {
    renderForm();
    goToEvidenceStep("915");

    // A cancelled picker fires change with an empty FileList in some browsers.
    selectFiles(photoInput(), []);

    expect(submitMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/report submitted/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("photo-pending")).not.toBeInTheDocument();
    // Unrelated fields survive.
    expect(screen.getByText(/₦915/)).toBeInTheDocument();
  });

  it("3+4. selecting a valid image stages it without submitting", () => {
    renderForm();
    goToEvidenceStep();

    selectFiles(photoInput(), [VALID_PHOTO()]);

    expect(submitMock).not.toHaveBeenCalled();
    const pending = screen.getByTestId("photo-pending");
    expect(pending).toHaveTextContent("queue.png");
    expect(pending).toHaveTextContent(/uploads when you submit/i);
    expect(screen.queryByText(/report submitted/i)).not.toBeInTheDocument();
  });

  it("pressing Enter in the price field cannot create a report", () => {
    renderForm();
    const price = screen.getByLabelText(/price in naira per litre/i);
    fireEvent.change(price, { target: { value: "915" } });
    fireEvent.keyDown(price, { key: "Enter", code: "Enter" });

    expect(submitMock).not.toHaveBeenCalled();
    // Enter only advances the wizard.
    expect(screen.getByText(/how long was the queue/i)).toBeInTheDocument();
  });

  it("submitting the form element directly does not create a report", () => {
    const { container } = renderForm();
    goToEvidenceStep();
    selectFiles(photoInput(), [VALID_PHOTO()]);

    fireEvent.submit(container.querySelector("form")!);

    expect(submitMock).not.toHaveBeenCalled();
  });
});

describe("explicit submission", () => {
  it("5+6. Submit uploads the staged photo with the report fields", async () => {
    renderForm();
    goToEvidenceStep("915");
    const file = VALID_PHOTO();
    selectFiles(photoInput(), [file]);

    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        station_id: STATION.id,
        fuel_type_code: "PMS",
        price_per_litre: 915,
        photo: file,
      }),
    );
  });

  it("11. success appears only after the backend confirms with a report id", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof api.submitReport>>) => void;
    submitMock.mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );

    renderForm();
    goToEvidenceStep();
    selectFiles(photoInput(), [VALID_PHOTO()]);
    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));

    // In flight: no success screen yet.
    await screen.findByText(/submitting…/i);
    expect(screen.queryByText(/report submitted/i)).not.toBeInTheDocument();

    resolve(makeReport("confirmed-id"));
    expect(await screen.findByText(/report submitted/i)).toBeInTheDocument();
  });

  it("12. a double tap cannot create two reports", async () => {
    submitMock.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(makeReport()), 50)),
    );
    renderForm();
    goToEvidenceStep();
    selectFiles(photoInput(), [VALID_PHOTO()]);

    const button = screen.getByRole("button", { name: /submit price report/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/submitting…/i)).toBeInTheDocument());
    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/report submitted/i)).toBeInTheDocument();
    expect(submitMock).toHaveBeenCalledTimes(1);
  });
});

describe("failures never fake a success", () => {
  it("7. an upload/backend rejection keeps the form and shows the reason", async () => {
    submitMock.mockRejectedValue(
      new api.ApiError(400, "Unsupported image type 'image/gif'. Allowed: image/jpeg, image/png, image/webp."),
    );

    renderForm();
    goToEvidenceStep();
    selectFiles(photoInput(), [VALID_PHOTO()]);
    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));

    expect(await screen.findByText(/unsupported image type/i)).toBeInTheDocument();
    expect(screen.queryByText(/report submitted/i)).not.toBeInTheDocument();
    // The staged photo and the price are preserved so the user can retry.
    expect(screen.getByTestId("photo-pending")).toHaveTextContent("queue.png");
    expect(
      screen.getByRole("button", { name: /submit price report/i }),
    ).toBeEnabled();
  });

  it("8. a network failure shows a connection error, not success", async () => {
    submitMock.mockRejectedValue(new api.ApiError(0, "Unable to reach the server."));

    renderForm();
    goToEvidenceStep();
    selectFiles(photoInput(), [VALID_PHOTO()]);
    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(screen.queryByText(/report submitted/i)).not.toBeInTheDocument();
  });

  it("retrying after a failure submits again", async () => {
    submitMock
      .mockRejectedValueOnce(new api.ApiError(503, "Temporarily unavailable."))
      .mockResolvedValueOnce(makeReport("second-try"));

    renderForm();
    goToEvidenceStep();
    selectFiles(photoInput(), [VALID_PHOTO()]);

    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));
    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));
    expect(await screen.findByText(/report submitted/i)).toBeInTheDocument();
    expect(submitMock).toHaveBeenCalledTimes(2);
  });
});

describe("file validation (mirrors the backend rules)", () => {
  it("9. an unsupported file type is rejected and never uploaded", async () => {
    renderForm();
    goToEvidenceStep();

    selectFiles(photoInput(), [makeFile("notes.pdf", "application/pdf", 1000)]);

    expect(screen.getByTestId("photo-error")).toHaveTextContent(/JPEG, PNG or WebP/i);
    expect(screen.queryByTestId("photo-pending")).not.toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("10. an oversized file is rejected using the backend's 5 MiB limit", () => {
    renderForm();
    goToEvidenceStep();

    selectFiles(photoInput(), [
      makeFile("huge.jpg", "image/jpeg", MAX_UPLOAD_BYTES + 1),
    ]);

    expect(screen.getByTestId("photo-error")).toHaveTextContent(/maximum is 5 MB/i);
    expect(screen.queryByTestId("photo-pending")).not.toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("an empty/unreadable file is rejected", () => {
    renderForm();
    goToEvidenceStep();
    selectFiles(photoInput(), [makeFile("empty.png", "image/png", 0)]);
    expect(screen.getByTestId("photo-error")).toHaveTextContent(/empty or unreadable/i);
  });

  it("re-selecting after an invalid file replaces the error with the new photo", () => {
    renderForm();
    goToEvidenceStep();

    selectFiles(photoInput(), [makeFile("bad.gif", "image/gif", 100)]);
    expect(screen.getByTestId("photo-error")).toBeInTheDocument();

    selectFiles(photoInput(), [VALID_PHOTO()]);
    expect(screen.queryByTestId("photo-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("photo-pending")).toHaveTextContent("queue.png");
  });

  it("a staged photo can be removed without submitting", () => {
    renderForm();
    goToEvidenceStep();
    selectFiles(photoInput(), [VALID_PHOTO()]);

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    expect(screen.queryByTestId("photo-pending")).not.toBeInTheDocument();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("a report can still be submitted without any photo (photo is optional)", async () => {
    renderForm();
    goToEvidenceStep();

    fireEvent.click(screen.getByRole("button", { name: /submit price report/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0][0].photo).toBeUndefined();
  });
});
