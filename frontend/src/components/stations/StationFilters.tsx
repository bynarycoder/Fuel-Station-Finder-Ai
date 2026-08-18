"use client";

/**
 * Finder controls — the complete Near Me experience, redesigned.
 *
 * LOCATION BEHAVIOUR IS UNCHANGED. The Zustand map store remains the single
 * location owner (backed by the `lib/geolocator.ts` singleton); this component
 * only triggers those shared actions and never touches `navigator.geolocation`
 * directly. The button labels ("Near me" / "Locating…" / "Tracking you" /
 * "Start tracking"), the "Browse all", "Recenter on Me", "Try again" and
 * "Search by city" affordances, and the `station-city-filter` input id are all
 * load-bearing behaviour covered by `StationFilters.test.tsx`.
 *
 * WHAT CHANGED IS THE UX:
 * - the old always-expanded wall of inputs, selects, chips and banners is now
 *   a compact primary row (Near me / Browse all / Filters) plus quick fuel
 *   chips;
 * - brand, city, radius, availability and verification live in a bottom-sheet
 *   filter panel;
 * - active filters are always shown as removable chips, so the user can never
 *   wonder why a result set looks short;
 * - the geolocation state machine renders through the shared
 *   `LocationStatusBanner`.
 */

import {
  Heart,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Navigation,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LocationStatusBanner } from "@/components/stations/LocationStatusBanner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { DialogHeader, Modal } from "@/components/ui/Sheet";
import { useAuth } from "@/hooks/useAuth";
import { applyLocationEvent } from "@/lib/geo";
import { cn } from "@/lib/utils";
import {
  DEFAULT_RADIUS_METERS,
  RADIUS_OPTIONS,
  useMapStore,
} from "@/store/useMapStore";
import { FUEL_TYPE_CODES, FUEL_TYPE_LABELS } from "@/types/station";

/** Debounce for the text inputs (avoid an API call per keystroke). */
const SEARCH_DEBOUNCE_MS = 400;

/** Short chip labels — the full names live in the filter sheet. */
const FUEL_SHORT: Record<string, string> = {
  PMS: "Petrol",
  AGO: "Diesel",
  DPK: "Kerosene",
  LPG: "Gas",
  CNG: "CNG",
};

interface StationFiltersProps {
  /** Compact layout for the mobile finder header. */
  compact?: boolean;
  /** Opens the shared LocationPicker (manual city/point selection). */
  onChooseLocation?: () => void;
  className?: string;
}

export function StationFilters({
  compact = false,
  onChooseLocation,
  className,
}: StationFiltersProps) {
  const {
    filters,
    mode,
    radiusMeters,
    userLocation,
    locationSource,
    manualLocationLabel,
    locationFailure,
    locationStatus,
    locationMessage,
    isWatching,
    favoritesOnly,
    setFilters,
    setMode,
    setLocationStatus,
    setRadiusMeters,
    setSelectedStationId,
    setFavoritesOnly,
    requestLocation,
    recenterLocation,
    stopLocationWatch,
  } = useMapStore();
  const auth = useAuth();

  const isNearby = mode === "nearby";
  const hasPosition = userLocation !== null;
  const isManual = locationSource === "manual";
  const isTracking =
    locationStatus === "tracking" ||
    locationStatus === "updating" ||
    locationStatus === "temporarily_unavailable";
  const loading = locationStatus === "requesting";

  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusCity, setFocusCity] = useState(false);
  const [showFavoritesPrompt, setShowFavoritesPrompt] = useState(false);

  // ---- Debounced brand / city inputs (inside the filter sheet) -------------
  const [draft, setDraft] = useState({ brand: filters.brand, city: filters.city });
  const lastCommitted = useRef({ brand: filters.brand, city: filters.city });

  useEffect(() => {
    setDraft({ brand: filters.brand, city: filters.city });
    lastCommitted.current = { brand: filters.brand, city: filters.city };
  }, [filters.brand, filters.city]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const patch: Partial<{ brand: string; city: string }> = {};
      const prev = lastCommitted.current;
      if (draft.brand !== prev.brand) patch.brand = draft.brand;
      if (draft.city !== prev.city) patch.city = draft.city;
      if (Object.keys(patch).length > 0) {
        lastCommitted.current = { ...prev, ...patch };
        setFilters(patch);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [draft, setFilters]);

  // ---- Location lifecycle (delegated to the store) -------------------------
  async function handleNearMe() {
    // Already actively tracking a known location? Recenter + freshen — never
    // stack a second watcher, never re-prompt.
    if (isNearby && hasPosition && isTracking) {
      recenterLocation();
      return;
    }
    await requestLocation();
  }

  function handleBrowseAll() {
    stopLocationWatch();
    setMode("browse");
    setSelectedStationId(null);
    const next = applyLocationEvent(
      { status: locationStatus, position: userLocation },
      { type: "watch_stop" },
    );
    setLocationStatus(next.status, next.message);
  }

  /** Failed geolocation → stay in browse and let the user type a city. */
  function handleSearchByCity() {
    handleBrowseAll();
    setFocusCity(true);
    setSheetOpen(true);
  }

  // Leaving nearby mode stops continuous tracking (battery).
  useEffect(() => {
    if (!isNearby) stopLocationWatch();
  }, [isNearby, stopLocationWatch]);

  useEffect(() => () => stopLocationWatch(), [stopLocationWatch]);

  function handleFavoritesToggle() {
    if (!auth.isAuthed) {
      setShowFavoritesPrompt(true);
      return;
    }
    setFavoritesOnly(!favoritesOnly);
  }

  const nearMeLabel = loading
    ? "Locating…"
    : isNearby && isWatching
      ? "Tracking you"
      : isNearby && isManual
        ? "Use my current location"
        : isNearby && hasPosition
          ? "Start tracking"
          : "Near me";

  // ---- Active filter chips -------------------------------------------------
  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (filters.fuelType) {
    activeChips.push({
      key: "fuel",
      label: FUEL_SHORT[filters.fuelType] ?? filters.fuelType,
      onRemove: () => setFilters({ fuelType: "" }),
    });
  }
  if (filters.brand) {
    activeChips.push({
      key: "brand",
      label: filters.brand,
      onRemove: () => setFilters({ brand: "" }),
    });
  }
  if (filters.city) {
    activeChips.push({
      key: "city",
      label: filters.city,
      onRemove: () => setFilters({ city: "" }),
    });
  }
  if (isNearby && radiusMeters !== DEFAULT_RADIUS_METERS) {
    activeChips.push({
      key: "radius",
      label: `Within ${radiusMeters >= 1000 ? `${radiusMeters / 1000} km` : `${radiusMeters} m`}`,
      onRemove: () => setRadiusMeters(DEFAULT_RADIUS_METERS),
    });
  }
  if (favoritesOnly) {
    activeChips.push({
      key: "favorites",
      label: "My favourites",
      onRemove: () => setFavoritesOnly(false),
    });
  }

  const filterCount = activeChips.length;

  return (
    <div className={cn(compact ? "space-y-1.5" : "space-y-2.5", className)}>
      {/* Primary controls (spec §11) — "Near me" is the orange proximity
          action, "Browse all" the dark-green supporting one. One compact,
          horizontally scrollable row so nothing is ever clipped at 320 px
          and the map keeps the vertical space. */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <Button
          variant="accent"
          size={compact ? "xs" : "md"}
          onClick={() => void handleNearMe()}
          disabled={loading}
          className={cn(
            "shrink-0",
            isNearby && "ring-2 ring-accent-500/40 ring-offset-1 ring-offset-canvas",
          )}
          title={isWatching ? "Live location tracking is active" : undefined}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
          )}
          {nearMeLabel}
        </Button>

        <Button
          variant={isNearby ? "secondary" : "deep"}
          size={compact ? "xs" : "md"}
          onClick={handleBrowseAll}
          className="shrink-0"
        >
          <MapIcon className="h-4 w-4" aria-hidden="true" />
          Browse all
        </Button>

        {onChooseLocation && (
          <Button
            variant="quiet"
            size={compact ? "icon-sm" : "md"}
            onClick={onChooseLocation}
            className="shrink-0"
            title="Search a city or pick a point on the map"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            <span className={compact ? "sr-only" : undefined}>Choose location</span>
          </Button>
        )}

        {isNearby && hasPosition && (
          <Button
            variant="secondary"
            size={compact ? "icon-sm" : "md"}
            onClick={() => recenterLocation()}
            className="shrink-0"
            title="Center the map on your current location"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            <span className={compact ? "sr-only" : undefined}>Recenter on Me</span>
          </Button>
        )}

        {compact && (
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={handleFavoritesToggle}
            aria-pressed={favoritesOnly}
            // Icon-only on the compact bar: the name lives on aria-label, NOT
            // in an sr-only <span> — an absolutely-positioned sr-only box
            // inside a horizontal scroll rail is measured against the page and
            // silently widened the document to 342 px at a 320 px viewport.
            aria-label={favoritesOnly ? "Showing favourites only" : "Show favourites only"}
            className={cn(
              "shrink-0",
              favoritesOnly && "border-accent-300 bg-accent-50 text-accent-700",
            )}
            title={
              auth.isAuthed
                ? "Show only your favorite stations"
                : "Sign in to use favorites"
            }
          >
            <Heart
              className={cn(
                "h-4 w-4",
                favoritesOnly && "fill-accent-400 text-accent-500",
              )}
              aria-hidden="true"
            />
          </Button>
        )}

        <Button
          variant="secondary"
          size={compact ? "xs" : "md"}
          onClick={() => {
            setFocusCity(false);
            setSheetOpen(true);
          }}
          className="ml-auto shrink-0"
          aria-haspopup="dialog"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {filterCount > 0 && (
            <Badge tone="solid" className="ml-0.5 px-1.5">
              {filterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/*
        The fuel chips that used to live here now render as the shared
        `FuelFilterChips` row directly under the search field (the reference
        design's placement). Both wrote to the SAME `filters.fuelType`, so
        keeping both produced a duplicated control — this row keeps only the
        Favourites toggle, which the chip row does not cover.

        On the compact (mobile) bar the toggle is folded into the action row
        above instead of costing the map another 36 px of height.
      */}
      {!compact && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={handleFavoritesToggle}
            aria-pressed={favoritesOnly}
            title={
              auth.isAuthed
                ? "Show only your favorite stations"
                : "Sign in to use favorites"
            }
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-body-sm font-semibold transition-colors duration-fast pointer-coarse:min-h-touch",
              favoritesOnly
                ? "border-accent-300 bg-accent-50 text-accent-700"
                : "border-hairline bg-surface text-ink-600 hover:border-ink-300",
            )}
          >
            <Heart
              className={cn("h-4 w-4", favoritesOnly && "fill-accent-400 text-accent-500")}
              aria-hidden="true"
            />
            {favoritesOnly ? "My favorites" : "Favorites"}
          </button>
        </div>
      )}

      {/* Always show what is actually filtered. */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-pill border border-brand-200 bg-brand-50 py-1 pl-2.5 pr-1 text-caption font-semibold text-brand-800"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove filter ${chip.label}`}
                className="flex h-6 w-6 items-center justify-center rounded-pill transition-colors hover:bg-brand-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setFilters({ fuelType: "", brand: "", city: "" });
              setRadiusMeters(DEFAULT_RADIUS_METERS);
              setFavoritesOnly(false);
            }}
            className="rounded-md px-2 py-1 text-caption font-medium text-ink-500 transition-colors hover:text-danger-strong"
          >
            Clear all
          </button>
        </div>
      )}

      <LocationStatusBanner
        status={locationStatus}
        message={locationMessage}
        userLocation={userLocation}
        isNearby={isNearby}
        isWatching={isWatching}
        locationSource={locationSource}
        manualLocationLabel={manualLocationLabel}
        failure={locationFailure}
        onRetry={() => void handleNearMe()}
        onSearchByCity={handleSearchByCity}
        onChooseLocation={onChooseLocation ?? handleSearchByCity}
        onUseDeviceLocation={() => void handleNearMe()}
      />

      {showFavoritesPrompt && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-info-border bg-info-soft px-3 py-2.5 text-caption leading-relaxed text-info-strong"
        >
          <Heart className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold">Sign in to use favourites</p>
            <p className="mt-0.5 opacity-90">
              Favourites are saved to your account. Sign in from the top-right,
              then tap the heart on any station.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFavoritesPrompt(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-info transition-colors hover:bg-white/60"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ---------------------------- filter sheet --------------------------- */}
      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        labelledBy="filters-title"
      >
        <DialogHeader
          title="Filters"
          titleId="filters-title"
          subtitle="Narrow the stations shown on the map and list"
          onClose={() => setSheetOpen(false)}
        />

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <Fieldset legend="Fuel">
            <div className="flex flex-wrap gap-1.5">
              <FuelChip
                label="Any fuel"
                active={filters.fuelType === ""}
                onClick={() => setFilters({ fuelType: "" })}
              />
              {FUEL_TYPE_CODES.map((code) => (
                <FuelChip
                  key={code}
                  label={FUEL_TYPE_LABELS[code]}
                  active={filters.fuelType === code}
                  onClick={() => setFilters({ fuelType: code })}
                />
              ))}
            </div>
          </Fieldset>

          {isNearby && (
            <Fieldset legend="Distance">
              <div className="flex flex-wrap gap-1.5">
                {RADIUS_OPTIONS.map((value) => (
                  <FuelChip
                    key={value}
                    label={value >= 1000 ? `${value / 1000} km` : `${value} m`}
                    active={radiusMeters === value}
                    onClick={() => setRadiusMeters(value)}
                  />
                ))}
              </div>
              <p className="mt-2 text-caption text-ink-500">
                Stations are searched within this distance of your position.
              </p>
            </Fieldset>
          )}

          <Fieldset legend="Brand">
            <input
              type="text"
              value={draft.brand}
              onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
              placeholder="e.g. NNPC, Mobil, A.A. Rano"
              aria-label="Filter by brand"
              className="h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-body-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 pointer-coarse:text-[16px]"
            />
          </Fieldset>

          <Fieldset legend="City">
            <input
              ref={(node) => {
                if (node && focusCity) {
                  node.focus();
                  setFocusCity(false);
                }
              }}
              id="station-city-filter"
              data-autofocus={focusCity ? "" : undefined}
              type="text"
              value={draft.city}
              onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
              placeholder="e.g. Lagos, Abuja, Kano"
              aria-label="Filter by city"
              className="h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-body-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 pointer-coarse:text-[16px]"
            />
            <p className="mt-2 text-caption text-ink-500">
              Searching by city works without sharing your location.
            </p>
          </Fieldset>

          <Fieldset legend="Saved">
            <button
              type="button"
              onClick={handleFavoritesToggle}
              aria-pressed={favoritesOnly}
              className={cn(
                "flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-body-sm font-semibold transition-colors",
                favoritesOnly
                  ? "border-accent-300 bg-accent-50 text-accent-700"
                  : "border-hairline bg-surface text-ink-700 hover:border-ink-300",
              )}
            >
              <Heart
                className={cn("h-4 w-4", favoritesOnly && "fill-accent-400 text-accent-500")}
                aria-hidden="true"
              />
              Only my favourite stations
            </button>
          </Fieldset>
        </div>

        <div className="flex items-center gap-2 border-t border-hairline bg-surface p-4 pb-safe">
          <Button
            variant="ghost"
            onClick={() => {
              setFilters({ fuelType: "", brand: "", city: "" });
              setRadiusMeters(DEFAULT_RADIUS_METERS);
              setFavoritesOnly(false);
            }}
          >
            Reset
          </Button>
          <Button block className="flex-1" onClick={() => setSheetOpen(false)}>
            Show results
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function FuelChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-pill border px-3.5 text-body-sm font-semibold transition-colors duration-fast pointer-coarse:min-h-touch",
        active
          ? "border-action bg-action text-action-fg"
          : "border-hairline bg-surface text-ink-600 hover:border-brand-300 hover:text-brand-700",
      )}
    >
      {label}
    </button>
  );
}

function Fieldset({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-label uppercase text-ink-500">{legend}</legend>
      {children}
    </fieldset>
  );
}
