"use client";

/**
 * Filter + search controls for the station finder — complete Near Me experience.
 *
 * Wires the browser geolocation hook to the Zustand map store and exposes:
 * - "Near me" — requests permission once, stores location, starts continuous watchPosition
 * - "Recenter on Me" — flies back to the last known location immediately, then
 *   silently tries to freshen the fix (never makes the user wait for GPS)
 * - Radius selector, fuel filters, debounced text search
 * - "Favorites" toggle (authenticated users) and recent-searches chips
 *
 * Error philosophy (see `lib/geo.ts`):
 * - A TIMEOUT / POSITION_UNAVAILABLE while a valid position exists is
 *   `temporarily_unavailable` → non-blocking amber banner, all results and the
 *   user marker stay on screen.
 * - Fatal panels (permission denied / unsupported / no-position errors) only
 *   appear when there is no valid location at all.
 */

import {
  AlertCircle,
  Clock3,
  Heart,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  Navigation,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import {
  applyLocationEvent,
  geoLog,
  hasMovedEnough,
  isPermissionDeniedCode,
  type GeoFailure,
} from "@/lib/geo";
import {
  DEFAULT_RADIUS_METERS,
  RADIUS_OPTIONS,
  useMapStore,
} from "@/store/useMapStore";
import {
  FUEL_TYPE_CODES,
  FUEL_TYPE_LABELS,
} from "@/types/station";

/** Debounce for the text-search inputs (avoid an API call per keystroke). */
const SEARCH_DEBOUNCE_MS = 400;

export function StationFilters() {
  const {
    filters,
    mode,
    radiusMeters,
    userLocation,
    locationStatus,
    locationMessage,
    favoritesOnly,
    setFilters,
    setMode,
    setUserLocation,
    setLocationStatus,
    setRadiusMeters,
    setSelectedStationId,
    setFavoritesOnly,
  } = useMapStore();
  const { request, refresh, startWatch, stopWatch, loading, isWatching } =
    useGeolocation();
  const auth = useAuth();
  const { searches, recordSearch, clearSearches } = useRecentSearches();

  const isNearby = mode === "nearby";
  const hasPosition = userLocation !== null;
  const isTracking =
    locationStatus === "tracking" ||
    locationStatus === "updating" ||
    locationStatus === "temporarily_unavailable";

  // Keep a ref of the last stored position so the watch callback can apply
  // the movement threshold without stale closures.
  const lastKnownRef = useRef(userLocation);
  lastKnownRef.current = userLocation;

  // ---- Debounced text search (name / brand / city) -------------------------
  const [searchInput, setSearchInput] = useState({
    q: filters.q,
    brand: filters.brand,
    city: filters.city,
  });
  // Keep the inputs in sync when filters change from elsewhere (recent
  // searches, resets) — without re-triggering the debounced writes.
  const lastCommitted = useRef({ q: filters.q, brand: filters.brand, city: filters.city });
  useEffect(() => {
    setSearchInput({
      q: filters.q,
      brand: filters.brand,
      city: filters.city,
    });
    lastCommitted.current = { q: filters.q, brand: filters.brand, city: filters.city };
  }, [filters.q, filters.brand, filters.city]);

  useEffect(() => {
    const handler = setTimeout(() => {
      const patch: Partial<{ q: string; brand: string; city: string }> = {};
      const prev = lastCommitted.current;
      if (searchInput.q !== prev.q) {
        patch.q = searchInput.q;
        recordSearch(searchInput.q, "name");
      }
      if (searchInput.brand !== prev.brand) {
        patch.brand = searchInput.brand;
        recordSearch(searchInput.brand, "brand");
      }
      if (searchInput.city !== prev.city) {
        patch.city = searchInput.city;
        recordSearch(searchInput.city, "city");
      }
      if (Object.keys(patch).length > 0) {
        lastCommitted.current = { ...prev, ...patch };
        setFilters(patch);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [searchInput, setFilters, recordSearch]);

  // ---- Location lifecycle --------------------------------------------------
  const handleStatus = useCallback(
    (state: { status: typeof locationStatus; message: string | null }) => {
      setLocationStatus(state.status, state.message);
    },
    [setLocationStatus],
  );

  const handleWatchUpdate = useCallback(
    (loc: { latitude: number; longitude: number }) => {
      const prev = lastKnownRef.current;
      const moved = hasMovedEnough(prev, loc);
      if (!moved) {
        // GPS jitter / no meaningful movement — keep the stored position and
        // the nearby results as-is; just restore a healthy tracking status.
        geoLog("watch: update within threshold — keeping position");
        handleStatus(applyLocationEvent({ status: locationStatus, position: prev }, { type: "success" }));
        return;
      }
      geoLog("watch: meaningful movement", {
        from: prev && { lat: prev.latitude.toFixed(4), lng: prev.longitude.toFixed(4) },
        to: { lat: loc.latitude.toFixed(4), lng: loc.longitude.toFixed(4) },
      });
      // Updating userLocation (the last known position) changes the nearby
      // query key → distances & closest station recalculate, nearby API refetches.
      setUserLocation(loc);
      handleStatus(applyLocationEvent({ status: locationStatus, position: loc }, { type: "success" }));
    },
    [handleStatus, locationStatus, setUserLocation],
  );

  const handleWatchError = useCallback(
    (failure: GeoFailure) => {
      const position = lastKnownRef.current;
      geoLog("watch: error event", { code: failure.code, hasPosition: position !== null });
      // Permission denied while watching: stop tracking so we never spam the
      // permission prompt; keep any last known position & results visible.
      if (isPermissionDeniedCode(failure.code)) {
        stopWatch();
      }
      handleStatus(applyLocationEvent({ status: locationStatus, position }, { type: "failure", code: failure.code }));
    },
    [handleStatus, locationStatus, stopWatch],
  );

  const beginTracking = useCallback(() => {
    handleStatus(applyLocationEvent({ status: locationStatus, position: lastKnownRef.current }, { type: "request_start" }));
    request()
      .then((loc) => {
        geoLog("near me: initial fix", {
          lat: loc.latitude.toFixed(4),
          lng: loc.longitude.toFixed(4),
        });
        setUserLocation(loc);
        setMode("nearby");
        setSelectedStationId(null);
        handleStatus(applyLocationEvent({ status: locationStatus, position: loc }, { type: "success" }));
        startWatch(handleWatchUpdate, handleWatchError);
      })
      .catch((failure: GeoFailure) => {
        geoLog("near me: initial acquisition failed", { code: failure.code });
        // If a valid position is already known (e.g. re-requesting after a
        // transient glitch) a failed fresh acquisition is NOT fatal.
        handleStatus(applyLocationEvent({ status: locationStatus, position: lastKnownRef.current }, { type: "failure", code: failure.code }));
      });
  }, [handleStatus, handleWatchError, handleWatchUpdate, locationStatus, request, setMode, setSelectedStationId, setUserLocation, startWatch]);

  async function handleNearMe() {
    // Already actively tracking a known location? Just recenter + freshen —
    // never stack a second watcher, never re-prompt.
    if (isNearby && hasPosition && isTracking) {
      handleRecenter();
      return;
    }
    beginTracking();
  }

  function handleBrowseAll() {
    stopWatch();
    setMode("browse");
    setSelectedStationId(null);
    handleStatus(applyLocationEvent({ status: locationStatus, position: lastKnownRef.current }, { type: "watch_stop" }));
  }

  function handleRecenter() {
    // 1) Center on the last known position IMMEDIATELY — no waiting for GPS.
    if (hasPosition) {
      window.dispatchEvent(new CustomEvent("recenter-on-me"));
      if (!isNearby) {
        setMode("nearby");
        setSelectedStationId(null);
      }
    }
    // 2) Freshen the fix in the background; update only on meaningful movement.
    handleStatus(applyLocationEvent({ status: locationStatus, position: lastKnownRef.current }, { type: "refresh_start" }));
    void refresh().then((loc) => {
      if (!loc) {
        // Optional refresh failed — the recenter already happened with the
        // last known position; stay in the previous state.
        geoLog("recenter: refresh failed, keeping last known position");
        if (lastKnownRef.current) {
          handleStatus(applyLocationEvent({ status: locationStatus, position: lastKnownRef.current }, { type: "success" }));
        }
        return;
      }
      if (hasMovedEnough(lastKnownRef.current, loc)) {
        setUserLocation(loc);
      }
      handleStatus(applyLocationEvent({ status: locationStatus, position: loc }, { type: "success" }));
      // Explicit refresh trigger for the nearby list (requirement: refresh
      // on explicit user recenter).
      window.dispatchEvent(new CustomEvent("nearby-refresh-requested"));
    });
  }

  // When the user leaves nearby mode, stop continuous tracking to save battery.
  useEffect(() => {
    if (!isNearby) {
      stopWatch();
    }
  }, [isNearby, stopWatch]);

  // Cleanup watch on unmount (hook also does this, but belt-and-suspenders).
  useEffect(() => {
    return () => stopWatch();
  }, [stopWatch]);

  // ---- Recent-search helpers ----------------------------------------------
  function applyRecentSearch(
    term: string,
    kind: "name" | "brand" | "city" | "fuel",
  ) {
    if (kind === "fuel") {
      setFilters({ fuelType: term });
      return;
    }
    if (kind === "name") {
      setFilters({ q: term });
      setSearchInput((s) => ({ ...s, q: term }));
    } else if (kind === "brand") {
      setFilters({ brand: term });
      setSearchInput((s) => ({ ...s, brand: term }));
    } else {
      setFilters({ city: term });
      setSearchInput((s) => ({ ...s, city: term }));
    }
    // Clicking a chip is an explicit search — commit immediately.
    lastCommitted.current = { ...lastCommitted.current, [kind === "name" ? "q" : kind]: term };
  }

  function handleFavoritesToggle() {
    if (!auth.isAuthed) {
      // Graceful unauthenticated handling: prompt instead of failing silently.
      setShowFavoritesPrompt(true);
      return;
    }
    setFavoritesOnly(!favoritesOnly);
  }

  const [showFavoritesPrompt, setShowFavoritesPrompt] = useState(false);

  const fatal =
    locationStatus === "error" ||
    locationStatus === "unsupported" ||
    (locationStatus === "permission_denied" && !hasPosition);

  const showNonFatalBanner =
    (locationStatus === "temporarily_unavailable" && hasPosition) ||
    (locationStatus === "permission_denied" && hasPosition) ||
    locationStatus === "updating";

  // Button label per requirement 12: tracking → "Tracking you";
  // nearby-but-stopped → "Start tracking"; otherwise "Near me".
  const nearMeLabel = loading
    ? "Locating…"
    : isNearby && isWatching
      ? "Tracking you"
      : isNearby && hasPosition
        ? "Start tracking"
        : "Near me";

  const bannerMessage =
    locationStatus === "permission_denied" && hasPosition
      ? "Location access is blocked. Showing results from your last known location — allow location access in your browser settings to resume live tracking."
      : locationStatus === "updating"
        ? "Updating your position…"
        : (locationMessage ??
          "Using your last known location. Trying to update...");

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={isNearby ? "secondary" : "primary"}
          size="sm"
          onClick={handleBrowseAll}
        >
          <MapIcon className="h-4 w-4" /> Browse all
        </Button>
        <Button
          type="button"
          variant={isNearby ? "accent" : "secondary"}
          size="sm"
          onClick={() => void handleNearMe()}
          disabled={loading}
          title={isWatching ? "Live location tracking is active" : undefined}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LocateFixed className={`h-4 w-4 ${isWatching ? "animate-pulse" : ""}`} />
          )}
          {nearMeLabel}
        </Button>

        {isNearby && hasPosition && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleRecenter}
            title="Center the map on your current location"
          >
            <Navigation className="h-4 w-4" /> Recenter on Me
          </Button>
        )}

        <Button
          type="button"
          variant={favoritesOnly ? "secondary" : "ghost"}
          size="sm"
          onClick={handleFavoritesToggle}
          title={auth.isAuthed ? "Show only your favorite stations" : "Sign in to use favorites"}
        >
          <Heart className={`h-4 w-4 ${favoritesOnly ? "fill-amber-500 text-amber-500" : ""}`} />
          {favoritesOnly ? "My favorites" : "Favorites"}
        </Button>

        {isNearby && (
          <label className="ml-auto flex items-center gap-2 text-xs font-medium text-gray-600">
            Radius
            <select
              className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-sm"
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
            >
              {RADIUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value >= 1000 ? `${value / 1000} km` : `${value} m`}
                </option>
              ))}
              {![...RADIUS_OPTIONS, DEFAULT_RADIUS_METERS].includes(
                radiusMeters,
              ) && <option value={radiusMeters}>{radiusMeters} m</option>}
            </select>
          </label>
        )}
      </div>

      {/* Non-fatal status banner — interface stays fully functional */}
      {showNonFatalBanner && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900"
        >
          {locationStatus === "updating" ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <span className="mt-0.5 inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {locationStatus === "permission_denied"
                ? "Live tracking paused"
                : locationStatus === "updating"
                  ? "Updating location"
                  : "Using your last known location"}
            </p>
            <p className="mt-0.5 opacity-90">{bannerMessage}</p>
          </div>
        </div>
      )}

      {/* Fatal panel — ONLY when there is no valid location at all */}
      {fatal && (
        <div
          role="alert"
          className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${
            locationStatus === "permission_denied"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {locationStatus === "permission_denied"
                ? "Location access denied"
                : locationStatus === "unsupported"
                  ? "Location not supported"
                  : "Could not get your location"}
            </p>
            <p className="mt-0.5 opacity-90">{locationMessage}</p>
            {locationStatus === "permission_denied" ? (
              <p className="mt-1.5 text-[11px] opacity-80">
                Tip: In your browser address bar, click the lock/location icon → allow location,
                then click <strong>Near me</strong> again. You can still browse all stations in the meantime.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => void handleNearMe()}>
                  Try again
                </Button>
                <Button variant="ghost" size="sm" onClick={handleBrowseAll}>
                  Browse all stations
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sign-in prompt for unauthenticated favorites */}
      {showFavoritesPrompt && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-900"
        >
          <Heart className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Sign in to use favorites</p>
            <p className="mt-0.5 opacity-90">
              Favorites are saved to your account. Sign in with the button in the top-right
              corner, then tap the heart on any station.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFavoritesPrompt(false)}
            className="shrink-0 rounded p-1 text-blue-400 hover:bg-black/5"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {isNearby && hasPosition && !fatal && !showNonFatalBanner && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Showing stations near you
          {isWatching ? " — live tracking on" : ""} · {userLocation.latitude.toFixed(4)},{" "}
          {userLocation.longitude.toFixed(4)}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search station name…"
            value={searchInput.q}
            onChange={(e) => setSearchInput((s) => ({ ...s, q: e.target.value }))}
            className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <input
          type="text"
          placeholder="Brand (e.g. NNPC)"
          value={searchInput.brand}
          onChange={(e) => setSearchInput((s) => ({ ...s, brand: e.target.value }))}
          className="h-10 rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <input
          type="text"
          placeholder="City"
          value={searchInput.city}
          onChange={(e) => setSearchInput((s) => ({ ...s, city: e.target.value }))}
          className="h-10 rounded-lg border border-gray-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Fuel
        </span>
        <button
          type="button"
          onClick={() => setFilters({ fuelType: "" })}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            filters.fuelType === ""
              ? "bg-emerald-700 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Any
        </button>
        {FUEL_TYPE_CODES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setFilters({ fuelType: code })}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filters.fuelType === code
                ? "bg-emerald-700 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {FUEL_TYPE_LABELS[code]}
          </button>
        ))}
      </div>

      {/* Recent searches */}
      {searches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
          <Clock3 className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Recent
          </span>
          {searches.slice(0, 5).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => applyRecentSearch(s.term, s.kind)}
              className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-600 hover:border-emerald-300 hover:text-emerald-700"
            >
              {s.kind === "fuel" ? FUEL_TYPE_LABELS[s.term as keyof typeof FUEL_TYPE_LABELS] ?? s.term : s.term}
            </button>
          ))}
          <button
            type="button"
            onClick={clearSearches}
            className="ml-auto rounded p-1 text-[11px] text-gray-400 hover:text-red-600"
            title="Clear search history"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
