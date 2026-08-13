/**
 * Hook-level tests for useGeolocation against a mocked navigator.geolocation.
 *
 * Covers:
 *  - one-shot request success / typed failure (tests A/B partly)
 *  - single active watcher, even across repeated startWatch calls (test G)
 *  - watcher cleared on stopWatch and on unmount (tests H)
 *  - watch success → onUpdate; watch error → onError with typed failure (C/E/F)
 *  - silent refresh never throws (test I)
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGeolocation } from "@/hooks/useGeolocation";
import { installGeoMock, removeGeoMock, type GeoMock } from "@/test/geoMock";

let geo: GeoMock;

beforeEach(() => {
  geo = installGeoMock();
});

afterEach(() => {
  removeGeoMock();
  vi.restoreAllMocks();
});

describe("request()", () => {
  it("resolves with coordinates on success (test A)", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: { latitude: number; longitude: number } | undefined;
    act(() => {
      result.current.request().then((loc) => {
        resolved = loc;
      });
      geo.getCurrentSuccess(9.0567, 7.49698);
    });
    await vi.waitFor(() => expect(resolved).toBeDefined());
    expect(resolved).toEqual({ latitude: 9.0567, longitude: 7.49698 });
    expect(result.current.loading).toBe(false);
  });

  it("rejects with code 3 on TIMEOUT (test B)", async () => {
    const { result } = renderHook(() => useGeolocation());
    let failure: { code: number; message: string } | undefined;
    act(() => {
      result.current.request().catch((err: { code: number; message: string }) => {
        failure = err;
      });
      // High-accuracy attempt times out → hook retries at low accuracy.
      geo.getCurrentError(3);
      geo.getCurrentError(3);
    });
    await vi.waitFor(() => expect(failure).toBeDefined());
    expect(failure!.code).toBe(3);
    expect(failure!.message).toContain("couldn't get your location in time");
    expect(failure!.message).not.toMatch(/\bTIMEOUT\b|code 3/i);
    expect(geo.calls.getCurrentPosition).toBe(2);
  });

  it("does not invent coordinates when both attempts time out", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: unknown = "pending";
    let failure: { code: number } | undefined;
    act(() => {
      result.current
        .request()
        .then((loc) => {
          resolved = loc;
        })
        .catch((err: { code: number }) => {
          failure = err;
          resolved = null;
        });
      geo.getCurrentError(3);
      geo.getCurrentError(3);
    });
    await vi.waitFor(() => expect(resolved).not.toBe("pending"));
    expect(resolved).toBeNull();
    expect(failure?.code).toBe(3);
  });

  it("uses the fallback fix when attempt 1 times out (browser coords, not a default city)", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: { latitude: number; longitude: number } | undefined;
    act(() => {
      result.current.request().then((loc) => {
        resolved = loc;
      });
      geo.getCurrentError(3);
      geo.getCurrentSuccess(10.5207, 7.4386);
    });
    await vi.waitFor(() => expect(resolved).toBeDefined());
    expect(resolved).toEqual({ latitude: 10.5207, longitude: 7.4386 });
    expect(geo.calls.getCurrentPosition).toBe(2);
  });

  it("retries POSITION_UNAVAILABLE once, then rejects without inventing a city", async () => {
    const { result } = renderHook(() => useGeolocation());
    let failure: { code: number; message: string } | undefined;
    act(() => {
      result.current.request().catch((err: { code: number; message: string }) => {
        failure = err;
      });
      geo.getCurrentError(2);
      geo.getCurrentError(2);
    });
    await vi.waitFor(() => expect(failure).toBeDefined());
    expect(failure!.code).toBe(2);
    expect(failure!.message).toContain("couldn't determine your location");
    expect(geo.calls.getCurrentPosition).toBe(2);
  });

  it("does not retry PERMISSION_DENIED", async () => {
    const { result } = renderHook(() => useGeolocation());
    let failure: { code: number } | undefined;
    act(() => {
      result.current.request().catch((err: { code: number }) => {
        failure = err;
      });
      geo.getCurrentError(1);
    });
    await vi.waitFor(() => expect(failure).toBeDefined());
    expect(failure!.code).toBe(1);
    expect(geo.calls.getCurrentPosition).toBe(1);
  });

  it("rejects with code 1 on PERMISSION_DENIED (test E)", async () => {
    const { result } = renderHook(() => useGeolocation());
    let failure: { code: number } | undefined;
    act(() => {
      result.current.request().catch((err: { code: number }) => {
        failure = err;
      });
      geo.getCurrentError(1);
    });
    await vi.waitFor(() => expect(failure).toBeDefined());
    expect(failure!.code).toBe(1);
  });
});

describe("startWatch / stopWatch", () => {
  it("creates exactly one watcher across repeated calls (test G)", () => {
    const { result } = renderHook(() => useGeolocation());
    const updates = vi.fn();
    act(() => {
      result.current.startWatch(updates);
      result.current.startWatch(updates);
      result.current.startWatch(updates);
    });
    expect(geo.calls.watchPosition).toBe(3); // restarts use the same slot
    expect(geo.calls.clearWatch).toBe(2); // each restart cleared the previous
    expect(geo.activeWatchId).not.toBeNull();
    expect(result.current.isWatching).toBe(true);
  });

  it("delivers watch success updates (test A)", () => {
    const { result } = renderHook(() => useGeolocation());
    const updates = vi.fn();
    act(() => {
      result.current.startWatch(updates);
    });
    act(() => geo.watchSuccess(9.1, 7.5));
    expect(updates).toHaveBeenCalledWith({ latitude: 9.1, longitude: 7.5 });
  });

  it("delivers typed watch errors without unregistering the watcher (tests C/E/F)", () => {
    const { result } = renderHook(() => useGeolocation());
    const updates = vi.fn();
    const errors = vi.fn();
    act(() => {
      result.current.startWatch(updates, errors);
    });
    act(() => geo.watchError(3));
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ code: 3 }));
    // Transient errors must NOT kill the watcher — the browser can retry.
    expect(result.current.isWatching).toBe(true);
    expect(geo.activeWatchId).not.toBeNull();
    // The watcher still delivers later fixes.
    act(() => geo.watchSuccess(9.2, 7.6));
    expect(updates).toHaveBeenCalledWith({ latitude: 9.2, longitude: 7.6 });
  });

  it("stopWatch clears the watcher (test G)", () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => {
      result.current.startWatch(vi.fn());
    });
    act(() => result.current.stopWatch());
    expect(geo.calls.clearWatch).toBe(1);
    expect(geo.activeWatchId).toBeNull();
    expect(result.current.isWatching).toBe(false);
  });

  it("clears the watcher on unmount (test H)", () => {
    const { result, unmount } = renderHook(() => useGeolocation());
    act(() => {
      result.current.startWatch(vi.fn());
    });
    expect(geo.activeWatchId).not.toBeNull();
    unmount();
    expect(geo.calls.clearWatch).toBeGreaterThan(0);
    expect(geo.activeWatchId).toBeNull();
  });
});

describe("refresh()", () => {
  it("resolves null on failure instead of throwing (test I)", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: unknown = "pending";
    act(() => {
      result.current.refresh().then((loc) => {
        resolved = loc;
      });
      geo.getCurrentError(3);
    });
    await vi.waitFor(() => expect(resolved).not.toBe("pending"));
    expect(resolved).toBeNull();
  });

  it("resolves with the fresh fix on success", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: unknown;
    act(() => {
      result.current.refresh().then((loc) => {
        resolved = loc;
      });
      geo.getCurrentSuccess(6.5244, 3.3792);
    });
    await vi.waitFor(() => expect(resolved).toBeDefined());
    expect(resolved).toEqual({ latitude: 6.5244, longitude: 3.3792 });
  });
});
