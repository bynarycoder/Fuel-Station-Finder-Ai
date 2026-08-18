/**
 * Contract tests for surfacing the backend's error `detail` in API client
 * failures — the change that lets the admin UI show WHY a verify call 404'd
 * (e.g. "Stored image not found: /media/..." vs a stale-deploy "Not Found")
 * instead of a bare status code.
 *
 * fetch is stubbed; no network is touched.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, verifyReport } from "@/services/api";

function stubFetchOnce(response: {
  ok: boolean;
  status: number;
  body: unknown;
}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const REPORT_ID = "ee645500-33ae-4953-aea6-d056e05ab0cb";

describe("verifyReport error surfacing", () => {
  it("calls POST /api/v1/reports/{id}/verify (relative to the API base)", async () => {
    const fetchMock = stubFetchOnce({ ok: true, status: 200, body: { score: 0.9 } });
    await verifyReport(REPORT_ID);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe(`/api/v1/reports/${REPORT_ID}/verify`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("surfaces the backend detail when the backend returns a 404", async () => {
    stubFetchOnce({
      ok: false,
      status: 404,
      body: { detail: "Stored image not found: /media/abc123.png" },
    });

    const error = (await verifyReport(REPORT_ID).catch((e) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    // The exact reason is now visible, not just a bare status code.
    expect(error.message).toContain("Stored image not found");
    expect(error.message).toContain("(404)");
  });

  it("falls back to the status-code message when the backend sends no detail", async () => {
    stubFetchOnce({ ok: false, status: 404, body: {} });

    const error = (await verifyReport(REPORT_ID).catch((e) => e)) as ApiError;

    expect(error.status).toBe(404);
    expect(error.message).toContain("Request to /reports/");
    expect(error.message).toContain("failed (404)");
  });
});
