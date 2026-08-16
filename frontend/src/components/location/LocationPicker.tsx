"use client";

/**
 * LocationPicker — the desktop-friendly manual location fallback.
 *
 * Shown when the browser cannot provide an accurate GPS fix (coarse
 * city-level accuracy, timeout, unavailable, …) or whenever the user simply
 * wants to search a city instead of sharing their device location.
 *
 * Location discipline (the one-location-owner rule):
 * - This component NEVER touches `navigator.geolocation`, never starts a
 *   watcher, and never writes `userLocation` directly.
 * - Search goes through the BACKEND geocoding proxy (Nominatim server-side);
 *   no third-party geocoding keys exist in the browser.
 * - The user must explicitly click a result — the first match is NEVER
 *   auto-selected, and no default city is ever used.
 * - On confirm it hands the chosen coordinates + label to the caller, which
 *   stores them through the shared store's `setManualLocation` action (the
 *   single location owner). Manual locations are intentional user input and
 *   do NOT start `watchPosition()`.
 *
 * Flow: search → pick a result → see it on the map → optionally drag the
 * marker to fine-tune → confirm. Dragging updates the label via the backend
 * reverse-geocode endpoint so the confirmed name matches the confirmed point.
 */

import { Loader2, MapPin, Search, SearchX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";
import { DialogHeader, Modal } from "@/components/ui/Sheet";
import { reverseGeocode, searchLocations } from "@/services/api";
import type { GeocodePlace } from "@/types/geocode";
import type { LatLng } from "@/types/station";
import { cn } from "@/lib/utils";

export interface PickedLocation extends LatLng {
  /** User-facing label, e.g. "Kaduna, Kaduna State, Nigeria". */
  label: string;
}

const SEARCH_DEBOUNCE_MS = 400;
/** Search field placeholder — place names only, never coordinates. */
const SEARCH_PLACEHOLDER = "Search city, town, area…";
/** Example place names for Nigerian users (search terms, NOT coordinates). */
const EXAMPLE_PLACES = [
  "Kaduna",
  "Kano",
  "Abuja",
  "Lagos",
  "Zaria",
  "Jos",
  "Ibadan",
  "Port Harcourt",
];

type SearchState = "idle" | "searching" | "done" | "error";

const LocationMap = dynamic(() => import("./LocationMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 w-full items-center justify-center rounded-xl border border-hairline bg-ink-100 text-caption text-ink-500">
      Loading map…
    </div>
  ),
});

interface LocationPickerProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called with the user-confirmed location. The caller stores it via the
   * shared `setManualLocation` store action (never directly).
   */
  onConfirm: (location: PickedLocation) => void;
}

export function LocationPicker({ open, onClose, onConfirm }: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<GeocodePlace[] | null>(null);
  /** The result the user explicitly clicked. */
  const [selected, setSelected] = useState<GeocodePlace | null>(null);
  /** Current marker position (starts at the selected place, follows drags). */
  const [marker, setMarker] = useState<LatLng | null>(null);
  /** Current label (from the selected place; updated after a drag). */
  const [label, setLabel] = useState<string>("");

  // Stale-response guards: a slow earlier request must never overwrite a
  // newer one, and reverse-geocoding runs debounced after a drag.
  const searchSeq = useRef(0);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseSeq = useRef(0);

  // Fresh picker every time it opens — no stale results/suggestion carryover.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSearchState("idle");
      setSearchError(null);
      setResults(null);
      setSelected(null);
      setMarker(null);
      setLabel("");
      searchSeq.current += 1;
    }
  }, [open]);

  // Debounced search — never one request per keystroke.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      searchSeq.current += 1;
      setSearchState("idle");
      setResults(null);
      return;
    }
    const seq = ++searchSeq.current;
    setSearchState("searching");
    const handle = setTimeout(async () => {
      try {
        const response = await searchLocations(trimmed);
        if (seq !== searchSeq.current) return; // stale response
        setResults(response.results);
        setSearchState("done");
      } catch (err) {
        if (seq !== searchSeq.current) return;
        setSearchError(
          err instanceof Error && err.message
            ? err.message
            : "Couldn't search locations right now. Try again.",
        );
        setSearchState("error");
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    return () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
    };
  }, []);

  function handleSelectPlace(place: GeocodePlace) {
    setSelected(place);
    setMarker({ latitude: place.latitude, longitude: place.longitude });
    setLabel(place.display_name);
  }

  /** Marker dragged: keep the REAL dragged coordinates, refresh the label. */
  function handleMarkerMove(latitude: number, longitude: number) {
    setMarker({ latitude, longitude });
    const seq = ++reverseSeq.current;
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(async () => {
      try {
        const place = await reverseGeocode(latitude, longitude);
        if (seq !== reverseSeq.current) return; // stale
        if (place?.display_name) setLabel(place.display_name);
      } catch {
        // Keep the previous label — the dragged coordinates are still real.
      }
    }, 350);
  }

  function handleConfirm() {
    if (!marker) return;
    onConfirm({
      latitude: marker.latitude,
      longitude: marker.longitude,
      label: label.trim() || "Selected location",
    });
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="location-picker-title">
      <DialogHeader
        title="Choose a location"
        titleId="location-picker-title"
        subtitle="Search your city or town to find nearby fuel stations"
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Search field */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <input
            type="search"
            data-autofocus=""
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={SEARCH_PLACEHOLDER}
            maxLength={120}
            aria-label="Search for a city, town or area"
            className="h-11 w-full rounded-lg border border-hairline bg-surface pl-9 pr-3 text-body-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 pointer-coarse:text-[16px]"
          />
        </div>

        {/* Example places — search terms only, never coordinates */}
        {(searchState === "idle" ||
          (searchState === "done" && (results ?? []).length === 0)) && (
            <div>
              <p className="text-label uppercase text-ink-500">Try searching</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXAMPLE_PLACES.map((place) => (
                  <button
                    key={place}
                    type="button"
                    onClick={() => setQuery(place)}
                    className="rounded-pill border border-hairline bg-surface px-2.5 py-1 text-caption font-medium text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-700"
                  >
                    {place}
                  </button>
                ))}
              </div>
              {searchState === "idle" && (
                <p className="mt-3 text-caption text-ink-500">
                  We never guess your location — pick the exact city, town or
                  area you want stations for.
                </p>
              )}
            </div>
          )}

        {/* Searching */}
        {searchState === "searching" && (
          <p
            role="status"
            className="flex items-center gap-2 text-caption text-ink-500"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Searching…
          </p>
        )}

        {/* Search error — friendly, never a raw provider error */}
        {searchState === "error" && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-danger-border bg-danger-soft px-3 py-2.5 text-caption leading-relaxed text-danger-strong"
          >
            <SearchX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold">Search isn&apos;t working</p>
              <p className="mt-0.5 opacity-90">{searchError}</p>
            </div>
          </div>
        )}

        {/* Results — the user MUST explicitly pick one. */}
        {searchState === "done" && (results ?? []).length > 0 && (
          <div>
            <p className="text-label uppercase text-ink-500">Results</p>
            <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
              {results!.map((place) => (
                <li key={`${place.latitude},${place.longitude}`}>
                  <button
                    type="button"
                    onClick={() => handleSelectPlace(place)}
                    aria-pressed={selected === place}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-brand-50",
                      selected === place && "bg-brand-50",
                    )}
                  >
                    <MapPin
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand-700"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm font-medium text-ink-900">
                        {place.display_name}
                      </span>
                      {place.type && (
                        <span className="mt-0.5 block text-caption text-ink-500">
                          {place.type}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-caption text-ink-500">
              Tap a result to place the marker, then confirm below.
            </p>
          </div>
        )}

        {/* Selected place: map + label + drag hint */}
        {selected && marker && (
          <div className="space-y-2.5">
            <div>
              <p className="text-label uppercase text-ink-500">Selected location</p>
              <p className="mt-1 flex items-start gap-1.5 text-body-sm font-semibold text-ink-900">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                {label}
              </p>
            </div>

            <LocationMap
              key={`${selected.latitude},${selected.longitude}`}
              latitude={marker.latitude}
              longitude={marker.longitude}
              onMove={handleMarkerMove}
            />
            <p className="text-caption text-ink-500">
              Drag the marker to fine-tune the exact point.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-hairline bg-surface p-4 pb-safe">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          block
          className="flex-1"
          disabled={!marker}
          onClick={handleConfirm}
        >
          Use this location
        </Button>
      </div>
    </Modal>
  );
}
