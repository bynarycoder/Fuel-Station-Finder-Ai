"use client";

/**
 * Fuel Intelligence — AI-assisted station recommendations.
 *
 * A self-contained panel that sends the user's natural-language request plus
 * their REAL GPS position to the backend (`POST /api/v1/ai/recommend`), where
 * the AI layer parses the intent, the existing nearby station API retrieves
 * candidates, deterministic ranking picks the winners, and the AI explains
 * the result using only returned facts.
 *
 * Honesty rules enforced here:
 * - Never asks the backend without a valid user location (the store's
 *   `userLocation` only ever holds accepted GPS fixes — see useGeolocation).
 * - Never invents a price: `latest_price === null` renders "Price information
 *   is currently unavailable."
 * - Provenance is rendered with the shared `StationProvenanceBadge`, so an
 *   imported/unverified station stays labeled exactly as the API says.
 * - Provider state is transparent: fallback answers are labeled as such.
 */

import {
  AlertCircle,
  Bot,
  ChevronDown,
  Crown,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";

import { StationProvenanceBadge } from "@/components/stations/StationProvenanceBadge";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/useGeolocation";
import { directionsUrl, formatDistance } from "@/lib/format";
import { requestAiRecommendation } from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import type { AIRecommendResponse } from "@/types/ai";
import { FUEL_TYPE_LABELS } from "@/types/station";

const EXAMPLE_QUERIES = [
  "Find the cheapest petrol near me",
  "Find the closest CNG station",
  "I need diesel under ₦1000",
  "Which nearby station is most reliable?",
];

const SORT_LABELS: Record<string, string> = {
  distance: "closest first",
  price: "cheapest first",
  best_overall: "best overall",
  reliability: "most reliable",
};

interface FuelIntelligenceProps {
  /** Called when the user taps "View Station" — selects it on the map. */
  onViewStation: (stationId: string) => void;
  /** Called when the panel is closed (rendered inline by the parent). */
  onClose?: () => void;
}

export function FuelIntelligence({ onViewStation, onClose }: FuelIntelligenceProps) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<AIRecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showRunnerUps, setShowRunnerUps] = useState(false);
  // The question waiting for a location fix (state, so the UI re-renders).
  const [pendingQuery, setPendingQuery] = useState("");

  const userLocation = useMapStore((s) => s.userLocation);
  const setUserLocation = useMapStore((s) => s.setUserLocation);
  const { request: requestGeolocation, loading: locating } = useGeolocation();

  async function ask(overrideQuery?: string, location = userLocation) {
    const text = (overrideQuery ?? query).trim();
    if (!text) return;
    setError(null);
    setLocationError(null);
    if (!location) {
      // No valid GPS fix — the assistant must not invent one.
      setPendingQuery(text);
      setResult(null);
      setPhase("idle");
      return;
    }
    setPendingQuery("");
    setPhase("loading");
    try {
      const response = await requestAiRecommendation({
        query: text,
        latitude: location.latitude,
        longitude: location.longitude,
      });
      setResult(response);
      setPhase("done");
    } catch (err) {
      setResult(null);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "The Fuel AI is unavailable right now. The regular station finder still works.",
      );
      setPhase("error");
    }
  }

  async function shareLocation() {
    setLocationError(null);
    try {
      const loc = await requestGeolocation();
      setUserLocation(loc);
      // If the user had already typed a question, answer it with the fresh fix.
      const pending = pendingQuery || query;
      if (pending.trim()) {
        await ask(pending, loc);
      }
    } catch (failure) {
      // Typed GeoFailure from the existing hook (coarse fixes are already
      // rejected there — we never accept a city-level centroid).
      const message =
        failure && typeof failure === "object" && "message" in failure
          ? String(failure.message)
          : "Could not get your location.";
      setLocationError(message);
    }
  }

  const needsLocation =
    phase !== "loading" &&
    (result?.needs_location === true ||
      (!userLocation && pendingQuery.trim() !== ""));

  return (
    <section
      className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-4 shadow-sm"
      aria-label="Fuel Intelligence assistant"
      data-testid="fuel-intelligence"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold text-gray-900">Fuel Intelligence</h2>
            <p className="text-[11px] text-gray-500">
              Ask in plain words — answers use real station data only
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-black/5 hover:text-gray-600"
            aria-label="Close Fuel Intelligence"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Query input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
          placeholder="e.g. Find the cheapest petrol near me"
          maxLength={300}
          className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          aria-label="Ask Fuel AI"
        />
        <Button
          type="button"
          onClick={() => void ask()}
          disabled={phase === "loading" || !query.trim()}
          className="shrink-0"
        >
          {phase === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Ask Fuel AI
        </Button>
      </div>

      {/* Example chips */}
      {phase !== "done" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Try
          </span>
          {EXAMPLE_QUERIES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuery(example);
                void ask(example);
              }}
              className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-gray-600 hover:border-emerald-300 hover:text-emerald-700"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {/* Location required */}
      {needsLocation && (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900"
        >
          <LocateFixed className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              I need your location to find stations near you.
            </p>
            <p className="mt-0.5 opacity-90">
              Share your exact GPS position (city-level guesses are not accepted) and
              I&apos;ll search the real station database.
            </p>
            {locationError && (
              <p className="mt-1 font-medium text-red-700">{locationError}</p>
            )}
            <div className="mt-2">
              <Button
                variant="accent"
                size="sm"
                onClick={() => void shareLocation()}
                disabled={locating}
              >
                {locating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="h-3.5 w-3.5" />
                )}
                Share my location
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {phase === "loading" && (
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-3 text-sm text-emerald-800"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Looking through nearby stations and ranking them…
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">The Fuel AI hit a snag</p>
            <p className="mt-0.5 opacity-90">{error}</p>
            <p className="mt-1 opacity-80">
              The regular station finder is unaffected — use the filters above or
              try again.
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {phase === "done" && result && (
        <div className="mt-3 space-y-3" data-testid="fuel-intelligence-result">
          {/* Parsed intent + provider transparency */}
          <IntentSummary result={result} />

          {result.recommendations.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700">
              {result.answer}
            </div>
          ) : (
            <>
              {/* Top recommendation */}
              <TopRecommendation
                result={result}
                userLocation={userLocation}
                onViewStation={onViewStation}
              />

              {/* Runner-ups */}
              {result.recommendations.length > 1 && (
                <div className="rounded-xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowRunnerUps((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-gray-600 hover:text-emerald-700"
                  >
                    <span>
                      {result.recommendations.length - 1} more option
                      {result.recommendations.length > 2 ? "s" : ""} — also strong
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showRunnerUps ? "rotate-180" : ""}`}
                    />
                  </button>
                  {showRunnerUps && (
                    <ul className="divide-y divide-gray-100 border-t border-gray-100">
                      {result.recommendations.slice(1).map((rec) => (
                        <li key={rec.station.id} className="px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-gray-900">
                                {rec.station.brand ? `${rec.station.brand} · ` : ""}
                                {rec.station.name}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {formatDistance(rec.station.distance_meters)} away
                                {rec.latest_price != null
                                  ? ` · ₦${rec.latest_price.toLocaleString()}/L`
                                  : " · price information is currently unavailable"}
                              </p>
                              <div className="mt-1">
                                <StationProvenanceBadge
                                  dataSource={rec.station.data_source}
                                  verificationStatus={rec.station.verification_status}
                                  compact
                                />
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                {Math.round(rec.score * 100)}%
                              </span>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => onViewStation(rec.station.id)}
                              >
                                View
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** The parsed intent + which provider produced each part. */
function IntentSummary({ result }: { result: AIRecommendResponse }) {
  const intent = result.intent;
  if (!intent) return null;
  const chips: string[] = [];
  if (intent.fuel_type) {
    chips.push(
      FUEL_TYPE_LABELS[intent.fuel_type as keyof typeof FUEL_TYPE_LABELS] ??
        intent.fuel_type,
    );
  }
  if (intent.sort_preference) {
    chips.push(SORT_LABELS[intent.sort_preference] ?? intent.sort_preference);
  }
  if (intent.max_price != null) chips.push(`under ₦${intent.max_price.toLocaleString()}`);
  if (intent.require_verified) chips.push("verified only");
  if (intent.radius_meters != null && intent.radius_meters < 100_000) {
    chips.push(`within ${formatDistance(intent.radius_meters)}`);
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="font-semibold uppercase tracking-wide text-gray-400">Understood as</span>
      {chips.length > 0 ? (
        chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800"
          >
            {chip}
          </span>
        ))
      ) : (
        <span className="text-gray-500">no specific filters</span>
      )}
      {result.answer_source === "fallback" && (
        <span
          className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-500"
          title="The AI provider was unavailable; a deterministic explanation was used."
        >
          explained without AI
        </span>
      )}
    </div>
  );
}

/** The recommended station card — real facts only, shared provenance badges. */
function TopRecommendation({
  result,
  userLocation,
  onViewStation,
}: {
  result: AIRecommendResponse;
  userLocation: { latitude: number; longitude: number } | null;
  onViewStation: (stationId: string) => void;
}) {
  const top = result.recommendations[0];
  const { station } = top;
  const directions = directionsUrl(
    { latitude: station.latitude, longitude: station.longitude },
    userLocation,
  );
  const breakdownRows: Array<{ label: string; value: number }> = [
    { label: "Distance", value: top.breakdown.distance },
    { label: "Price", value: top.breakdown.price },
    { label: "Trust", value: top.breakdown.verification },
    { label: "Freshness", value: top.breakdown.freshness },
  ];

  return (
    <div
      className="rounded-2xl border-2 border-emerald-400 bg-white p-4 shadow-sm"
      data-testid="ai-top-recommendation"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
          <Crown className="h-3.5 w-3.5" /> Best option for you
        </div>
        <span className="rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-extrabold text-white">
          {Math.round(top.score * 100)}% match
        </span>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-gray-900">
            {station.brand ? `${station.brand} · ` : ""}
            {station.name}
          </p>
          {(station.address || station.city) && (
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {[station.address, [station.city, station.state].filter(Boolean).join(", ")]
                .filter(Boolean)
                .join(" — ")}
            </p>
          )}
          <div className="mt-1.5">
            <StationProvenanceBadge
              dataSource={station.data_source}
              verificationStatus={station.verification_status}
            />
          </div>
        </div>
        {typeof station.distance_meters === "number" && (
          <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-extrabold text-white shadow-sm">
            {formatDistance(station.distance_meters)} away
          </span>
        )}
      </div>

      {/* Facts: fuel + reported price (never invented) */}
      <div className="mt-3 space-y-1 rounded-xl bg-emerald-50/60 p-2.5 ring-1 ring-emerald-100">
        {station.fuel_types.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {station.fuel_types.map((fuel) => (
              <span
                key={fuel.code}
                className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
              >
                {fuel.code}
              </span>
            ))}
          </div>
        )}
        {top.latest_price != null ? (
          <p className="text-sm font-bold text-gray-900" data-testid="ai-price">
            ₦{top.latest_price.toLocaleString()}/L
            <span className="ml-1.5 text-[11px] font-medium text-gray-500">
              latest reported{top.latest_price_fuel_type ? ` · ${top.latest_price_fuel_type}` : ""}
            </span>
          </p>
        ) : (
          <p className="text-xs font-medium text-gray-500" data-testid="ai-price-unavailable">
            Price information is currently unavailable.
          </p>
        )}
      </div>

      {/* Why this station */}
      <div className="mt-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          Why this station?
        </p>
        <p className="mt-0.5 text-sm text-gray-800">{top.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-600">{result.answer}</p>
      </div>

      {/* Deterministic score breakdown */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {breakdownRows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500">
              <span>{row.label}</span>
              <span>{Math.round(row.value * 100)}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${Math.round(row.value * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {directions && (
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800"
          >
            <Navigation className="h-3.5 w-3.5" /> Directions
          </a>
        )}
        <button
          type="button"
          onClick={() => onViewStation(station.id)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50"
        >
          <MapPin className="h-3.5 w-3.5" /> View Station
        </button>
      </div>
    </div>
  );
}
