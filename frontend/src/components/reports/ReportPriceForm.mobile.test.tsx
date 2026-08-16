/**
 * Mobile ergonomics + accessibility contract for the report flow.
 *
 * Complements ReportPriceForm.test.tsx (which owns the submit state machine)
 * with the things that break specifically on a phone:
 *
 *  - text-entry controls render at >= 16px on touch devices, otherwise iOS
 *    Safari zooms the page on focus and never zooms back out;
 *  - the photo picker is a real, labelled control with a visible "Browse"
 *    affordance;
 *  - validation errors are programmatically associated with their field, so a
 *    screen-reader user is told what is wrong and not just that something is;
 *  - the primary action stays reachable: it is a button (not a form submit),
 *    it announces its busy state, and it is disabled while in flight.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportPriceForm } from "@/components/reports/ReportPriceForm";
import * as api from "@/services/api";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/upload";
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

function toEvidenceStep(price = "915") {
  fireEvent.change(screen.getByLabelText(/price in naira per litre/i), {
    target: { value: price },
  });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

function makeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

function selectFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  submitMock.mockReset();
  submitMock.mockResolvedValue({ id: "r1" } as never);
});

describe("iOS zoom-on-focus", () => {
  it("renders the notes field at >= 16px on touch devices", () => {
    renderForm();
    toEvidenceStep();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    const notes = screen.getByPlaceholderText(/PMS available/i);
    expect(notes.className).toContain("pointer-coarse:text-[16px]");
  });
});

describe("the photo picker is a real, labelled control", () => {
  it("is an accessible file input that accepts only the supported types", () => {
    renderForm();
    toEvidenceStep();

    const input = screen.getByTestId("report-photo-input") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input).toHaveAccessibleName();
    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(input.getAttribute("accept")).toContain(type);
    }
    // `capture` would force the camera and hide the gallery/Browse option.
    expect(input.hasAttribute("capture")).toBe(false);
  });

  it("shows a visible Browse affordance that changes once a photo is staged", () => {
    renderForm();
    toEvidenceStep();

    expect(screen.getByText(/browse photos/i)).toBeInTheDocument();

    selectFiles(screen.getByTestId("report-photo-input") as HTMLInputElement, [
      makeFile("queue.png", "image/png", 1000),
    ]);

    expect(screen.getByText(/choose a different photo/i)).toBeInTheDocument();
    expect(screen.queryByText(/browse photos/i)).not.toBeInTheDocument();
  });
});

describe("errors are announced and associated with their field", () => {
  it("links the photo error to the file input", () => {
    renderForm();
    toEvidenceStep();

    const input = screen.getByTestId("report-photo-input") as HTMLInputElement;
    selectFiles(input, [makeFile("notes.pdf", "application/pdf", 1000)]);

    const error = screen.getByTestId("photo-error");
    expect(error).toHaveAttribute("role", "alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("links the price error to the price input", () => {
    renderForm();
    // Force the price validation to fail from the evidence step.
    fireEvent.change(screen.getByLabelText(/price in naira per litre/i), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    const price = screen.getByLabelText(/price in naira per litre/i);
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(price).toHaveAttribute("aria-invalid", "true");
    expect(price.getAttribute("aria-describedby")).toBe(alerts[0].id);
  });
});

describe("the primary action is a button, not a form submit", () => {
  it("submits only on click and reports its busy state", async () => {
    let resolve!: (v: unknown) => void;
    submitMock.mockImplementation(() => new Promise((r) => { resolve = r; }));

    renderForm();
    toEvidenceStep();

    const button = screen.getByRole("button", { name: /submit price report/i });
    expect(button).toHaveAttribute("type", "button");

    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled(),
    );

    resolve({ id: "r1" });
    expect(await screen.findByText(/report submitted/i)).toBeInTheDocument();
    expect(submitMock).toHaveBeenCalledTimes(1);
  });
});
