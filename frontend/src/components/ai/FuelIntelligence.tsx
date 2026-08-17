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
 * Honesty rules enforced here (unchanged):
 * - Never asks the backend without a valid user location.
 * - Never invents a price: `latest_price === null` renders "Price information
 *   is currently unavailable."
 * - Provenance is rendered with the shared `StationProvenanceBadge`, so an
 *   imported/unverified station stays labeled exactly as the API says.
 * - Provider state is transparent: fallback answers are labeled as such.
 *
 * Location discipline (regression guard): this panel READS `userLocation`
 * from the store and NEVER acquires, writes, resets, or watches location by
 * itself. "Share my location" delegates to the store's single location
 * lifecycle (`requestLocation`) — the same code path as the finder's
 * "Near me" button — so mounting/opening/closing the panel has ZERO side
 * effects on the geolocation state machine.
 *
 * DESIGN: a modern assistant surface — a scrolling conversation area with
 * user/assistant bubbles and a sticky composer, matching the reference. The
 * ANSWER itself is still a designed recommendation card (price, distance,
 * availability, then "Why this station?") rather than a wall of prose,
 * because the user's question is "where do I refuel".
 *
 * The transcript is presentation only: `ask()` still sends exactly one
 * request per explicit user action and the panel never re-asks on its own.
 */

import {
  AlertCircle,
  ChevronDown,
  Crown,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { StationProvenanceBadge } from "@/components/stations/StationProvenanceBadge";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ThinkingDots } from "@/components/ui/states";
import { looksLikeStationSearch } from "@/lib/aiRouting";
import { directionsUrl, formatDistance } from "@/lib/format";
import { stationLabel, stationNameParts } from "@/lib/stationName";
import { cn } from "@/lib/utils";
import { requestAiRecommendation } from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import type { AIRecommendResponse } from "@/types/ai";
import { FUEL_TYPE_LABELS } from "@/types/station";

/**
 * Suggested prompts. A mix on purpose: the first three exercise the grounded
 * station workflow, the last is a general question Groq answers
 * conversationally with no location involved.
 */
const EXAMPLE_QUERIES = [
  "Find the cheapest petrol near me",
  "Which stations are open nearby?",
  "What fuel stations are close to me?",
  // NOTE: suggestions deliberately contain NO price figure. A "₦1000" in a
  // chip is indistinguishable, to a reader (and to the honesty test), from a
  // price the app is claiming — and the app must never show a number it did
  // not get from a real report.
  "What should I check before buying fuel?",
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
  /** A question routed in from the unified search bar. */
  initialQuery?: string;
  /** Bump to re-ask `initialQuery` (same text asked twice). */
  querySignal?: number;
  /** Opens the shared LocationPicker (manual city/point selection). */
  onChooseLocation?: () => void;
}

export function FuelIntelligence({
  onViewStation,
  onClose,
  initialQuery,
  querySignal = 0,
  onChooseLocation,
}: FuelIntelligenceProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<AIRecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showRunnerUps, setShowRunnerUps] = useState(false);
  // The question waiting for a location fix (state, so the UI re-renders).
  const [pendingQuery, setPendingQuery] = useState("");
  /**
   * The question currently being answered, echoed as the user's chat turn.
   * Presentation only — it is set from the SAME text `ask()` sends, so the
   * bubble can never show something different from what was requested.
   */
  const [asked, setAsked] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const userLocation = useMapStore((s) => s.userLocation);
  // The app's single location lifecycle lives in the store; this panel only
  // delegates to it. "requesting" drives the button's "locating" spinner.
  const requestLocation = useMapStore((s) => s.requestLocation);
  const locating = useMapStore((s) => s.locationStatus === "requesting");
  // Source + label come from the SAME store — the panel never owns a second
  // location lifecycle, it just labels what the shared owner decided.
  const locationSource = useMapStore((s) => s.locationSource);
  const manualLocationLabel = useMapStore((s) => s.manualLocationLabel);

  // When a location arrives AFTER a question was parked (first GPS fix, or a
  // manual selection from the picker), ask the parked question with it.
  // Live watch updates are ignored: `prev` is already non-null then.
  const prevUserLocationRef = useRef(userLocation);
  useEffect(() => {
    const prev = prevUserLocationRef.current;
    prevUserLocationRef.current = userLocation;
    if (!userLocation || prev) return;
    const pending = pendingQuery.trim();
    if (pending) {
      void ask(pending, userLocation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);

  async function ask(overrideQuery?: string, location = userLocation) {
    const text = (overrideQuery ?? query).trim();
    if (!text) return;
    setError(null);
    setLocationError(null);
    // A STATION SEARCH needs a real position: park it until the user shares
    // one (the assistant must never invent coordinates). A general question
    // needs no location at all and is sent straight to Groq — the backend
    // re-runs the same routing rules and stays authoritative.
    if (!location && looksLikeStationSearch(text)) {
      setPendingQuery(text);
      setAsked(text);
      setResult(null);
      setPhase("idle");
      return;
    }
    setPendingQuery("");
    setAsked(text);
    setPhase("loading");
    try {
      const response = await requestAiRecommendation({
        query: text,
        ...(location
          ? { latitude: location.latitude, longitude: location.longitude }
          : {}),
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

  // Keep the latest turn visible as the conversation grows.
  useEffect(() => {
    if (!asked && phase === "idle") return;
    // Feature-detected: jsdom (and very old browsers) have no scrollIntoView,
    // and this is a pure nicety — it must never throw during a render commit.
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [asked, phase, result]);

  // A question handed in from the unified search bar is asked immediately.
  useEffect(() => {
    const incoming = initialQuery?.trim();
    if (!incoming) return;
    setQuery(incoming);
    void ask(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, querySignal]);

  async function shareLocation() {
    setLocationError(null);
    // Delegate to the store's single location lifecycle: the shared 5 km
    // accuracy protection applies, the state machine decides fatal vs.
    // temporarily_unavailable, and exactly one watcher can ever run.
    const loc = await requestLocation();
    if (!loc) {
      setLocationError(
        useMapStore.getState().locationMessage ?? "Could not get your location.",
      );
      return;
    }
    const pending = pendingQuery || query;
    if (pending.trim()) {
      await ask(pending, loc);
    }
  }

  const needsLocation =
    phase !== "loading" &&
    (result?.needs_location === true ||
      (!userLocation && pendingQuery.trim() !== ""));

  return (
    <section
      className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-e2"
      aria-label="Fuel Intelligence assistant"
      data-testid="fuel-intelligence"
    >
      {/* Branded header — makes it unmistakable that this is the AI surface. */}
      <div className="flex shrink-0 items-center justify-between gap-2 bg-brand-sheen px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-white/15 text-white ring-1 ring-white/25">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-h3 text-slab-fg">Fuel AI Assistant</h2>
            <p className="truncate text-caption text-white/85">
              Ask me anything about fuel stations
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/15 hover:text-white"
            aria-label="Close Fuel Intelligence"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ------------------------------------------- conversation area ---
          Scrolls independently of the composer, which stays pinned to the
          bottom so the send button is reachable with the keyboard open. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
        {/* Empty conversation: the assistant introduces itself rather than
            leaving a blank panel. */}
        {phase === "idle" && !asked && !needsLocation && (
          <AssistantBubble>
            <p className="text-body-sm text-ink-800">
              Hi! I can find fuel stations near you, compare reported prices and
              answer general fuel questions. What do you need?
            </p>
          </AssistantBubble>
        )}

        {/* The question currently being answered, echoed as the user's turn. */}
        {asked && (
          <div className="flex justify-end">
            <p
              className="max-w-[85%] break-words rounded-2xl rounded-br-md bg-action px-3.5 py-2.5 text-body-sm text-action-fg shadow-e1"
              data-testid="ai-user-message"
            >
              {asked}
            </p>
          </div>
        )}

        {/* Location required */}
        {needsLocation && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-2xl rounded-bl-md border border-warning-border bg-warning-soft px-3 py-3 text-caption leading-relaxed text-warning-strong"
          >
            <LocateFixed className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold">
                I need your location to find stations near you.
              </p>
              <p className="mt-0.5 opacity-90">
                Share your exact GPS position (city-level guesses are not accepted) or
                choose a city, and I&apos;ll search the real station database.
              </p>
              {locationError && (
                <p className="mt-1 font-semibold text-danger-strong">{locationError}</p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => void shareLocation()}
                  disabled={locating}
                >
                  {locating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <LocateFixed className="h-4 w-4" aria-hidden="true" />
                  )}
                  Share my location
                </Button>
                {onChooseLocation && (
                  <Button variant="secondary" size="sm" onClick={onChooseLocation}>
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Choose a location
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Location source indicator — manual selections are labelled honestly,
            never as GPS / live tracking. */}
        {userLocation && locationSource === "manual" && manualLocationLabel && (
          <p className="flex items-center gap-1.5 text-caption text-brand-700">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Using selected location — {manualLocationLabel}
            {onChooseLocation && (
              <button
                type="button"
                onClick={onChooseLocation}
                className="inline-flex items-center px-1 font-semibold text-brand-800 underline-offset-2 hover:underline pointer-coarse:min-h-touch"
              >
                Change
              </button>
            )}
          </p>
        )}

        {/* Loading — a typing indicator, the conversational equivalent of a
            skeleton, plus the shaped placeholder for the answer card. */}
        {phase === "loading" && (
          <AssistantBubble role="status">
            <span className="flex items-center gap-2.5 text-body-sm font-medium text-brand-800">
              <ThinkingDots className="text-brand-600" />
              Reading nearby stations and recent reports…
            </span>
            <span className="mt-2.5 block space-y-2">
              <span className="skeleton block h-3 w-3/5 rounded-md" />
              <span className="skeleton block h-3 w-2/5 rounded-md" />
            </span>
          </AssistantBubble>
        )}

        {/* Error */}
        {phase === "error" && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl rounded-bl-md border border-danger-border bg-danger-soft px-3 py-3 text-caption leading-relaxed text-danger-strong"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold">The Fuel AI hit a snag</p>
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
          <div className="space-y-3 animate-slide-up" data-testid="fuel-intelligence-result">
            {result.mode !== "conversation" && <IntentSummary result={result} />}

            {result.mode === "conversation" ? (
              <div
                className="rounded-2xl rounded-bl-md border border-hairline bg-ink-50 px-3.5 py-3"
                data-testid="ai-conversation-answer"
              >
                <p className="whitespace-pre-line break-words text-body-sm text-ink-800">
                  {result.answer}
                </p>
                <AnswerSourceLabel source={result.answer_source} />
              </div>
            ) : result.recommendations.length === 0 ? (
              <div className="break-words rounded-2xl rounded-bl-md border border-hairline bg-ink-50 px-3.5 py-3 text-body-sm text-ink-700">
                {result.answer}
              </div>
            ) : (
              <>
                <TopRecommendation
                  result={result}
                  userLocation={userLocation}
                  onViewStation={onViewStation}
                />

                {result.recommendations.length > 1 && (
                  <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
                    <button
                      type="button"
                      onClick={() => setShowRunnerUps((v) => !v)}
                      aria-expanded={showRunnerUps}
                      className="flex min-h-[44px] w-full items-center justify-between px-3 py-2.5 text-body-sm font-semibold text-ink-600 transition-colors hover:bg-ink-50 hover:text-brand-700"
                    >
                      <span>
                        {result.recommendations.length - 1} more option
                        {result.recommendations.length > 2 ? "s" : ""} — also strong
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-base",
                          showRunnerUps && "rotate-180",
                        )}
                        aria-hidden="true"
                      />
                    </button>
                    {showRunnerUps && (
                      <ul className="divide-y divide-hairline border-t border-hairline">
                        {result.recommendations.slice(1).map((rec) => (
                          <li key={rec.station.id} className="px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-body-sm font-semibold text-ink-900">
                                  {stationLabel(rec.station.brand, rec.station.name)}
                                </p>
                                <p className="mt-0.5 text-caption text-ink-500">
                                  {formatDistance(rec.station.distance_meters)} away
                                  {rec.latest_price != null
                                    ? ` · ₦${rec.latest_price.toLocaleString()}/L`
                                    : " · price information is currently unavailable"}
                                </p>
                                <div className="mt-1.5">
                                  <StationProvenanceBadge
                                    dataSource={rec.station.data_source}
                                    verificationStatus={rec.station.verification_status}
                                    compact
                                  />
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1.5">
                                <Badge tone="brand">{Math.round(rec.score * 100)}%</Badge>
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

        {/* Quick actions — real prompts, sent through the same ask() path. */}
        {phase !== "loading" && (
          <div className="mt-1">
            <p className="text-caption text-ink-500">
              {asked ? "You can also try:" : "Try asking:"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLE_QUERIES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setQuery(example);
                    void ask(example);
                  }}
                  className="inline-flex items-center rounded-pill border border-hairline bg-surface px-3 py-1.5 text-caption font-medium text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-700 pointer-coarse:min-h-touch"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Anchor the scroll position at the newest turn. */}
        <div ref={endRef} aria-hidden="true" />
      </div>

      {/* --------------------------------------------------- composer ---
          Sticky at the bottom of the panel. The parent sheet lifts the whole
          surface above the on-screen keyboard (see Sheet's visualViewport
          handling), so the field and send button are never covered. */}
      <div className="shrink-0 border-t border-hairline bg-surface p-3">
        <div className="flex items-end gap-2">
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
            placeholder="Ask anything..."
            maxLength={300}
            enterKeyHint="send"
            className="h-12 min-w-0 flex-1 rounded-pill border border-hairline bg-canvas px-4 text-[16px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            aria-label="Ask Fuel AI"
          />
          <button
            type="button"
            onClick={() => void ask()}
            disabled={phase === "loading" || !query.trim()}
            /* Distinct from the input's own "Ask Fuel AI" label so the two
               controls stay individually addressable by assistive tech. */
            aria-label="Ask Fuel AI — send message"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-action text-action-fg shadow-e1 transition-all duration-fast hover:bg-action-hover active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {phase === "loading" ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * An assistant turn. Left-aligned with the "tail" corner squared off, mirroring
 * the user's right-aligned green bubble.
 */
function AssistantBubble({
  children,
  role,
}: {
  children: ReactNode;
  role?: "status";
}) {
  return (
    <div
      role={role}
      className="max-w-[92%] rounded-2xl rounded-bl-md border border-hairline bg-ink-50 px-3.5 py-3"
    >
      {children}
    </div>
  );
}

/**
 * Says who actually wrote the answer. A deterministic safety answer is never
 * presented as an AI one.
 */
function AnswerSourceLabel({ source }: { source: string }) {
  const isAi = source === "groq";
  return (
    <p className="mt-2 text-caption text-ink-500" data-testid="ai-answer-source">
      {isAi ? (
        <span className="inline-flex items-center gap-1 font-medium text-brand-700">
          <Sparkles className="h-3 w-3" aria-hidden="true" /> AI answer
        </span>
      ) : (
        <span
          className="rounded-pill bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500"
          title="The AI provider was unavailable; a standard answer was shown."
        >
          answered without AI
        </span>
      )}
    </p>
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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-label uppercase text-ink-500">Understood as</span>
      {chips.length > 0 ? (
        chips.map((chip) => (
          <Badge key={chip} tone="brand">
            {chip}
          </Badge>
        ))
      ) : (
        <span className="text-caption text-ink-500">no specific filters</span>
      )}
      {result.answer_source === "fallback" && (
        <span
          className="rounded-pill bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500"
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
  const topName = stationNameParts(station.brand, station.name);
  const breakdownRows: Array<{ label: string; value: number }> = [
    { label: "Distance", value: top.breakdown.distance },
    { label: "Price", value: top.breakdown.price },
    { label: "Trust", value: top.breakdown.verification },
    { label: "Freshness", value: top.breakdown.freshness },
  ];

  return (
    <div
      className="overflow-hidden rounded-2xl border border-brand-300 bg-surface shadow-e2"
      data-testid="ai-top-recommendation"
    >
      <div className="flex items-center justify-between gap-2 bg-brand-50 px-4 py-2">
        <span className="flex items-center gap-1.5 text-label uppercase text-brand-800">
          <Crown className="h-3.5 w-3.5" aria-hidden="true" /> Best match for you
        </span>
        <Badge tone="solid">{Math.round(top.score * 100)}% match</Badge>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-h2 text-ink-900">
              {topName.brandPrefix && (
                <span className="font-medium text-ink-500">
                  {topName.brandPrefix}{" "}
                </span>
              )}
              {topName.name}
            </p>
            {(station.address || station.city) && (
              <p className="mt-0.5 truncate text-caption text-ink-500">
                {[station.address, [station.city, station.state].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
            )}
          </div>
          {typeof station.distance_meters === "number" && (
            <Badge tone="solid-accent" size="md" className="shrink-0">
              {formatDistance(station.distance_meters)} away
            </Badge>
          )}
        </div>

        {/* Facts: price → fuels. Never invented. */}
        <div className="mt-3 rounded-xl bg-brand-50/70 p-3 ring-1 ring-brand-100">
          {top.latest_price != null ? (
            <p className="text-display leading-none text-brand-900" data-testid="ai-price">
              ₦{top.latest_price.toLocaleString()}
              <span className="ml-1 text-body-sm font-semibold text-brand-700">
                /L
              </span>
              <span className="ml-2 text-caption font-medium text-ink-500">
                latest reported
                {top.latest_price_fuel_type ? ` · ${top.latest_price_fuel_type}` : ""}
              </span>
            </p>
          ) : (
            <p
              className="text-body-sm font-medium text-ink-500"
              data-testid="ai-price-unavailable"
            >
              Price information is currently unavailable.
            </p>
          )}
          {station.fuel_types.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {station.fuel_types.map((fuel) => (
                <span
                  key={fuel.code}
                  className="rounded-pill bg-surface px-2 py-0.5 text-[11px] font-bold text-brand-800 ring-1 ring-brand-200"
                >
                  {fuel.code}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3">
          <StationProvenanceBadge
            dataSource={station.data_source}
            verificationStatus={station.verification_status}
          />
        </div>

        {/* Why this station */}
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="text-label uppercase text-ink-500">Why this station?</p>
          <p className="mt-1 break-words text-body-sm text-ink-800">{top.reason}</p>
          <p className="mt-1 break-words text-caption leading-relaxed text-ink-600">
            {result.answer}
          </p>
        </div>

        {/* Deterministic score breakdown */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {breakdownRows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between text-[10px] font-semibold text-ink-500">
                <span>{row.label}</span>
                <span className="tabular-nums">{Math.round(row.value * 100)}</span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-pill bg-ink-100"
                role="img"
                aria-label={`${row.label} score ${Math.round(row.value * 100)} of 100`}
              >
                <div
                  className="h-full rounded-pill bg-action transition-[width] duration-slow ease-entrance"
                  style={{ width: `${Math.round(row.value * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {directions && (
            <ButtonLink
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Navigation className="h-4 w-4" aria-hidden="true" /> Directions
            </ButtonLink>
          )}
          <Button variant="secondary" onClick={() => onViewStation(station.id)}>
            <MapPin className="h-4 w-4" aria-hidden="true" /> View Station
          </Button>
        </div>
      </div>
    </div>
  );
}
