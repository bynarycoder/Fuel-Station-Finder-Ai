/**
 * Hook-level tests for useGeolocation against a mocked navigator.geolocation.
 *
 * Covers:
 *  - one-shot request success / typed failure (tests A/B partly)
 *  - single active watcher, even across repeated startWatch calls (test G)
 *  - watcher cleared on stopWatch and on unmount (tests H)
 *  - watch success → onUpdate; watch error → onError with typed failure (C/E/F)
 *  - silent refresh never throws (test I)
 *  - fix-accuracy validation: extremely coarse fixes (> 5 km) are never
 *    accepted as a valid location, in request / refresh / watch paths
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

describe("simulated GPS override (?geo= URL param)", () => {
  const KADUNA = { latitude: 10.5207, longitude: 7.4386 };

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("request() resolves the simulated fix WITHOUT calling navigator.geolocation", async () => {
    window.history.replaceState(null, "", "/?geo=10.5207,7.4386");
    const { result } = renderHook(() => useGeolocation());
    let resolved: { latitude: number; longitude: number } | undefined;
    await act(async () => {
      resolved = await result.current.request();
    });
    // Kaduna — the simulated position, never a default city.
    expect(resolved).toEqual(KADUNA);
    expect(geo.calls.getCurrentPosition).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("refresh() returns the simulated fix without real GPS", async () => {
    window.history.replaceState(null, "", "/?geo=9.082,7.472,50");
    const { result } = renderHook(() => useGeolocation());
    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.refresh();
    });
    expect(resolved).toEqual({ latitude: 9.082, longitude: 7.472 });
    expect(geo.calls.getCurrentPosition).toBe(0);
  });

  it("startWatch() is skipped while the override is active (real fixes cannot overwrite the simulated one)", () => {
    window.history.replaceState(null, "", "/?geo=10.5207,7.4386");
    const { result } = renderHook(() => useGeolocation());
    let watchId: number | null = 999;
    act(() => {
      watchId = result.current.startWatch(vi.fn());
    });
    expect(watchId).toBeNull();
    expect(geo.calls.watchPosition).toBe(0);
  });

  it("request() uses the REAL browser geolocation when no ?geo= param is present", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: { latitude: number; longitude: number } | undefined;
    act(() => {
      result.current.request().then((loc) => {
        resolved = loc;
      });
      geo.getCurrentSuccess(6.5244, 3.3792);
    });
    await vi.waitFor(() => expect(resolved).toBeDefined());
    expect(resolved).toEqual({ latitude: 6.5244, longitude: 3.3792 });
    expect(geo.calls.getCurrentPosition).toBe(1);
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

describe("fix accuracy validation (coarse-fix rejection)", () => {
  it("request(): a 50 km fix is rejected as an invalid location, never resolved", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: unknown = "pending";
    let failure: { code: number; message: string } | undefined;
    act(() => {
      result.current
        .request()
        .then((loc) => {
          resolved = loc;
        })
        .catch((err: { code: number; message: string }) => {
          failure = err;
          resolved = null;
        });
      // Reproduces the reported bug: the browser returns a city-centroid fix
      // with ~50 km accuracy. Both attempts deliver the same coarse fix.
      geo.getCurrentSuccess(9.03, 7.47, 50_000);
      geo.getCurrentSuccess(9.03, 7.47, 50_000);
    });
    await vi.waitFor(() => expect(resolved).not.toBe("pending"));
    expect(resolved).toBeNull(); // no coordinates were invented or accepted
    expect(failure?.code).toBe(2); // transient POSITION_UNAVAILABLE
    expect(failure?.message).toContain("couldn't determine your location");
    expect(geo.calls.getCurrentPosition).toBe(2);
    expect(result.current.loading).toBe(false);
  });

  it("request(): a coarse first fix is treated as transient and the fallback attempt is used", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: { latitude: number; longitude: number } | undefined;
    act(() => {
      result.current.request().then((loc) => {
        resolved = loc;
      });
      geo.getCurrentSuccess(9.03, 7.47, 50_000); // coarse → fallback
      geo.getCurrentSuccess(10.5207, 7.4386, 30); // accurate browser fix
    });
    await vi.waitFor(() => expect(resolved).toBeDefined());
    expect(resolved).toEqual({ latitude: 10.5207, longitude: 7.4386 });
    expect(geo.calls.getCurrentPosition).toBe(2);
  });

  it("request(): accuracy of exactly 5,000 m (boundary) is accepted", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: { latitude: number; longitude: number } | undefined;
    act(() => {
      result.current.request().then((loc) => {
        resolved = loc;
      });
      geo.getCurrentSuccess(9.0567, 7.49698, 5_000);
    });
    await vi.waitFor(() => expect(resolved).toBeDefined());
    expect(resolved).toEqual({ latitude: 9.0567, longitude: 7.49698 });
    expect(geo.calls.getCurrentPosition).toBe(1);
  });

  it("request(): a valid accurate GPS fix (25 m) is accepted normally", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: { latitude: number; longitude: number } | undefined;
    act(() => {
      result.current.request().then((loc) => {
        resolved = loc;
      });
      geo.getCurrentSuccess(6.5244, 3.3792, 25);
    });
    await vi.waitFor(() => expect(resolved).toBeDefined());
    expect(resolved).toEqual({ latitude: 6.5244, longitude: 3.3792 });
    expect(result.current.loading).toBe(false);
  });

  it("refresh(): a 50 km fix resolves null instead of overwriting the last known position", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: unknown = "pending";
    act(() => {
      result.current.refresh().then((loc) => {
        resolved = loc;
      });
      geo.getCurrentSuccess(9.03, 7.47, 50_000);
    });
    await vi.waitFor(() => expect(resolved).not.toBe("pending"));
    expect(resolved).toBeNull();
    expect(geo.calls.getCurrentPosition).toBe(1);
  });

  it("refresh(): accepts accuracy of exactly 5,000 m (boundary)", async () => {
    const { result } = renderHook(() => useGeolocation());
    let resolved: unknown;
    act(() => {
      result.current.refresh().then((loc) => {
        resolved = loc;
      });
      geo.getCurrentSuccess(9.0567, 7.49698, 5_000);
    });
    await vi.waitFor(() => expect(resolved).toBeDefined());
    expect(resolved).toEqual({ latitude: 9.0567, longitude: 7.49698 });
  });

  it("watch(): an inaccurate update does not overwrite the current location", () => {
    const { result } = renderHook(() => useGeolocation());
    const updates = vi.fn();
    act(() => {
      result.current.startWatch(updates);
    });
    // A good fix first — this is the stored "current location".
    act(() => geo.watchSuccess(9.0567, 7.49698, 20));
    expect(updates).toHaveBeenCalledTimes(1);
    expect(updates).toHaveBeenCalledWith({ latitude: 9.0567, longitude: 7.49698 });

    // A 50 km coarse fix must NOT overwrite it…
    act(() => geo.watchSuccess(9.03, 7.47, 50_000));
    expect(updates).toHaveBeenCalledTimes(1);

    // …and the watcher stays alive, still delivering good fixes afterwards.
    expect(result.current.isWatching).toBe(true);
    expect(geo.activeWatchId).not.toBeNull();
    act(() => geo.watchSuccess(9.1, 7.5, 15));
    expect(updates).toHaveBeenCalledTimes(2);
    expect(updates).toHaveBeenLastCalledWith({ latitude: 9.1, longitude: 7.5 });
  });

  it("watch(): accepts a fix at the 5,000 m accuracy boundary", () => {
    const { result } = renderHook(() => useGeolocation());
    const updates = vi.fn();
    act(() => {
      result.current.startWatch(updates);
    });
    act(() => geo.watchSuccess(9.0567, 7.49698, 5_000));
    expect(updates).toHaveBeenCalledWith({ latitude: 9.0567, longitude: 7.49698 });
  });
});
