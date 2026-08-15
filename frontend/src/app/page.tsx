"use client";

/**
 * Fuel Station Finder — the finder experience.
 *
 * ONE screen, two compositions:
 *
 *   mobile (<lg)  full-bleed map + draggable bottom sheet + bottom nav
 *   desktop (≥lg) results rail on the left, map filling the rest
 *
 * The task the whole screen serves is "where should I buy fuel?", so the
 * hierarchy is: intent line → one search field → Near me → map + station cards.
 *
 * Behaviour preserved from the previous implementation:
 * - selecting a station (list, map, or AI) opens the detail panel;
 * - reporting a price requires sign-in and reopens the form afterwards;
 * - the `nearby-refresh-requested` event refetches the active query;
 * - placeholder (previous-location) nearby data never presents as current, and
 *   never crowns a "closest" station.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, Sparkles } from "lucide-react";

import { FuelIntelligence } from "@/components/ai/FuelIntelligence";
import { SignInModal } from "@/components/auth/SignInModal";
import StationMap from "@/components/map/StationMap";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ReportPriceForm } from "@/components/reports/ReportPriceForm";
import { ReportsFeed } from "@/components/reports/ReportsFeed";
import { SearchBar } from "@/components/search/SearchBar";
import { AppHeader } from "@/components/shell/AppHeader";
import { MobileBottomNav, type FinderTab } from "@/components/shell/MobileBottomNav";
import { LocationPrimer } from "@/components/stations/LocationPrimer";
import { StationDetail } from "@/components/stations/StationDetail";
import { StationFilters } from "@/components/stations/StationFilters";
import { StationList } from "@/components/stations/StationList";
import { Button } from "@/components/ui/button";
import { BottomSheet, DialogHeader, Modal, SidePanel, type SheetSnap } from "@/components/ui/Sheet";
import { useAuth } from "@/hooks/useAuth";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useFavorites } from "@/hooks/useFavorites";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { useStationsQuery } from "@/hooks/useStations";
import { DEFAULT_RADIUS_METERS, RADIUS_OPTIONS, useMapStore } from "@/store/useMapStore";

export default function FinderPage() {
  const auth = useAuth();
  const favorites = useFavorites(auth.isAuthed);
  const {
    items,
    isLoading,
    isFetching,
    isError,
    refetch,
    isNearby,
    isPlaceholderData,
  } = useStationsQuery(favorites.favoriteIds);
  // A placeholder set belongs to a previous location/query — while the nearby
  // fetch for the CURRENT position is in flight show the loading state
  // instead of potentially another city's stations.
  const showLoading = isLoading || (isNearby && isFetching && isPlaceholderData);

  const userLocation = useMapStore((s) => s.userLocation);
  const selectedStationId = useMapStore((s) => s.selectedStationId);
  const setSelectedStationId = useMapStore((s) => s.setSelectedStationId);
  const filters = useMapStore((s) => s.filters);
  const setFilters = useMapStore((s) => s.setFilters);
  const radiusMeters = useMapStore((s) => s.radiusMeters);
  const setRadiusMeters = useMapStore((s) => s.setRadiusMeters);
  const setFavoritesOnly = useMapStore((s) => s.setFavoritesOnly);
  const requestLocation = useMapStore((s) => s.requestLocation);
  const locationStatus = useMapStore((s) => s.locationStatus);

  const { searches, recordSearch, clearSearches } = useRecentSearches();
  // The AI surface is an inline panel on desktop and a sheet on mobile — a
  // behavioural difference, so it is resolved in JS rather than with
  // `lg:hidden` (which would leave a duplicate dialog mounted).
  const isDesktop = useIsDesktop();

  const [tab, setTab] = useState<FinderTab>("map");
  const [snap, setSnap] = useState<SheetSnap>("peek");
  const [showReports, setShowReports] = useState(false);
  const [showFuelAi, setShowFuelAi] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiSignal, setAiSignal] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [signInIntent, setSignInIntent] = useState<"report" | null>(null);

  const selectedStation = items.find((s) => s.id === selectedStationId) ?? null;
  // Never crown a "closest" station from placeholder (previous-location) data.
  const closestStationId =
    isNearby && !showLoading && items.length > 0 ? items[0].id : null;

  // "Recenter on Me" (and any explicit user refresh) re-runs the active query.
  useEffect(() => {
    const handler = () => void refetch();
    window.addEventListener("nearby-refresh-requested", handler as EventListener);
    return () =>
      window.removeEventListener("nearby-refresh-requested", handler as EventListener);
  }, [refetch]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedStationId(id);
      setShowDetail(true);
    },
    [setSelectedStationId],
  );

  function handleRequireSignIn() {
    setAuthModalMode("signin");
    setSignInIntent("report");
    setShowSignIn(true);
  }

  async function handleSignIn(email: string, password: string) {
    await auth.signIn(email, password);
    setShowSignIn(false);
    if (signInIntent === "report") setShowReportForm(true);
    setSignInIntent(null);
  }

  async function handleSignUp(email: string, password: string) {
    const result = await auth.signUp(email, password);
    if (result.isSignedIn) {
      setShowSignIn(false);
      if (signInIntent === "report") setShowReportForm(true);
      setSignInIntent(null);
    }
    return result;
  }

  function handleToggleFavorite(stationId: string) {
    if (!auth.isAuthed) {
      handleRequireSignIn();
      return;
    }
    favorites.toggleFavorite(stationId);
  }

  /** Unified search: plain terms filter the catalogue. */
  const handleSearch = useCallback(
    (term: string) => {
      setFilters({ q: term });
      if (term.trim()) recordSearch(term, "name");
    },
    [setFilters, recordSearch],
  );

  /** Unified search: questions go to Fuel Intelligence. */
  const handleAsk = useCallback((question: string) => {
    setAiQuery(question);
    setAiSignal((n) => n + 1);
    setShowFuelAi(true);
    setTab("ai");
  }, []);

  /** Widen the nearby search from an empty state. */
  const handleExpandRadius = useCallback(() => {
    const next = RADIUS_OPTIONS.find((r) => r > radiusMeters);
    setRadiusMeters(next ?? RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1]);
  }, [radiusMeters, setRadiusMeters]);

  const handleClearFilters = useCallback(() => {
    setFilters({ q: "", brand: "", city: "", fuelType: "" });
    setRadiusMeters(DEFAULT_RADIUS_METERS);
    setFavoritesOnly(false);
  }, [setFilters, setRadiusMeters, setFavoritesOnly]);

  // Mobile tab → surface mapping. Every tab performs a real action.
  function handleTabChange(next: FinderTab) {
    setTab(next);
    if (next === "map") setSnap("peek");
    if (next === "list") setSnap("full");
    if (next === "ai") setShowFuelAi(true);
    if (next === "reports") setShowReports(true);
  }

  const recentChips = useMemo(
    () =>
      searches.slice(0, 4).map((s) => ({
        id: s.id,
        label: s.term,
        onApply: () => {
          if (s.kind === "fuel") setFilters({ fuelType: s.term });
          else if (s.kind === "brand") setFilters({ brand: s.term });
          else if (s.kind === "city") setFilters({ city: s.term });
          else setFilters({ q: s.term });
        },
      })),
    [searches, setFilters],
  );

  const isLocating = locationStatus === "requesting";
  const needsLocationPrimer =
    !isNearby && userLocation === null && locationStatus === "idle";

  const stationList = (
    <StationList
      items={items}
      isLoading={showLoading}
      isError={isError}
      isNearby={isNearby}
      selectedId={selectedStationId}
      userLocation={userLocation}
      onSelect={handleSelect}
      onRetry={() => void refetch()}
      favoriteIds={favorites.favoriteIds}
      onToggleFavorite={handleToggleFavorite}
      onExpandRadius={handleExpandRadius}
      onClearFilters={handleClearFilters}
    />
  );

  const mapSurface = (
    <StationMap
      items={items}
      userLocation={userLocation}
      selectedStationId={selectedStationId}
      isNearby={isNearby}
      closestStationId={closestStationId}
      onSelect={handleSelect}
      controlsClassName="bottom-[calc(38%+0.75rem)] lg:bottom-4"
    />
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      <a href="#stations" className="skip-link">
        Skip to station results
      </a>

      <OfflineBanner />

      <AppHeader
        authReady={auth.ready}
        isAuthed={auth.isAuthed}
        isAuthAvailable={auth.isAuthAvailable}
        isAdmin={auth.user?.role === "admin"}
        email={auth.user?.email}
        onSignIn={() => {
          setAuthModalMode("signin");
          setSignInIntent(null);
          setShowSignIn(true);
        }}
        onSignUp={() => {
          setAuthModalMode("signup");
          setSignInIntent(null);
          setShowSignIn(true);
        }}
        onSignOut={() => auth.signOut()}
        onOpenReports={() => setShowReports(true)}
      />

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ------------------------------------------------ desktop rail --- */}
        <section
          id="stations"
          aria-label="Find fuel"
          className="hidden min-h-0 w-full shrink-0 flex-col border-r border-hairline bg-canvas lg:flex lg:w-[420px] xl:w-[460px]"
        >
          <div className="shrink-0 space-y-3 border-b border-hairline bg-surface p-4">
            <div>
              <h1 className="text-h1 text-ink-900">Find fuel near you</h1>
              <p className="mt-0.5 text-body-sm text-ink-500">
                Compare prices, queues and availability from real driver reports.
              </p>
            </div>
            <SearchBar
              value={filters.q}
              onSearch={handleSearch}
              onAsk={handleAsk}
              recent={recentChips}
              onClearRecent={clearSearches}
            />
            <StationFilters />
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {needsLocationPrimer && (
              <LocationPrimer
                loading={isLocating}
                onUseLocation={() => void requestLocation()}
                onSearchManually={() =>
                  document
                    .querySelector<HTMLInputElement>('input[type="search"]')
                    ?.focus()
                }
              />
            )}

            {showFuelAi && isDesktop && (
              <FuelIntelligence
                onViewStation={handleSelect}
                onClose={() => setShowFuelAi(false)}
                initialQuery={aiQuery}
                querySignal={aiSignal}
              />
            )}

            {!(showFuelAi && isDesktop) && (
              <button
                type="button"
                onClick={() => setShowFuelAi(true)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-body-sm font-semibold text-ink-900">
                    Ask Fuel Intelligence
                  </span>
                  <span className="block truncate text-caption text-ink-500">
                    &ldquo;Find the cheapest petrol near me&rdquo;
                  </span>
                </span>
              </button>
            )}

            {stationList}
          </div>
        </section>

        {/* ------------------------------------------------ mobile stack --- */}
        <div className="flex min-h-0 flex-1 flex-col lg:hidden">
          <div className="shrink-0 space-y-2.5 border-b border-hairline bg-surface px-4 pb-3 pt-3">
            <h1 className="text-h2 text-ink-900">Find fuel near you</h1>
            <SearchBar
              value={filters.q}
              onSearch={handleSearch}
              onAsk={handleAsk}
              placeholder="Search stations or ask AI"
            />
            <StationFilters compact />
          </div>

          {/* Map surface with the station sheet layered on top. */}
          <div className="relative min-h-0 flex-1">
            {mapSurface}

            <BottomSheet snap={snap} onSnapChange={setSnap} title="Nearby stations">
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-h3 text-ink-900">
                    {isNearby ? "Nearby stations" : "All stations"}
                  </h2>
                  <span className="text-caption text-ink-500" aria-live="polite">
                    {showLoading ? "Searching…" : `${items.length} found`}
                  </span>
                </div>

                {needsLocationPrimer && (
                  <LocationPrimer
                    loading={isLocating}
                    onUseLocation={() => void requestLocation()}
                    onSearchManually={() => setSnap("half")}
                  />
                )}

                <StationList
                  items={items}
                  isLoading={showLoading}
                  isError={isError}
                  isNearby={isNearby}
                  selectedId={selectedStationId}
                  userLocation={userLocation}
                  onSelect={handleSelect}
                  onRetry={() => void refetch()}
                  favoriteIds={favorites.favoriteIds}
                  onToggleFavorite={handleToggleFavorite}
                  onExpandRadius={handleExpandRadius}
                  onClearFilters={handleClearFilters}
                  hideCount
                />
              </div>
            </BottomSheet>
          </div>
        </div>

        {/* ------------------------------------------------- desktop map --- */}
        <section
          aria-label="Station map"
          className="relative hidden min-h-0 flex-1 lg:block"
        >
          {mapSurface}
        </section>
      </main>

      <MobileBottomNav
        active={tab}
        onChange={handleTabChange}
        stationCount={items.length}
        className="lg:hidden"
      />

      {/* --------------------------------------------------- overlays ------ */}

      {/* Fuel Intelligence (mobile presents it as a sheet) */}
      <Modal
        open={showFuelAi && !isDesktop}
        onClose={() => {
          setShowFuelAi(false);
          if (tab === "ai") setTab("map");
        }}
        labelledBy="ai-sheet-title"
      >
        <h2 id="ai-sheet-title" className="sr-only">
          Fuel Intelligence
        </h2>
        <div className="min-h-0 overflow-y-auto">
          <FuelIntelligence
            onViewStation={(id) => {
              setShowFuelAi(false);
              if (tab === "ai") setTab("map");
              handleSelect(id);
            }}
            onClose={() => {
              setShowFuelAi(false);
              if (tab === "ai") setTab("map");
            }}
            initialQuery={aiQuery}
            querySignal={aiSignal}
          />
        </div>
      </Modal>

      {/* Station details (home of "Report fuel price") */}
      <SidePanel
        open={showDetail && !!selectedStation}
        onClose={() => setShowDetail(false)}
        labelledBy="station-detail-title"
      >
        {selectedStation && (
          <StationDetail
            station={selectedStation}
            userLocation={userLocation}
            isAuthed={auth.isAuthed}
            isFavorite={favorites.favoriteIds.has(selectedStation.id)}
            onToggleFavorite={handleToggleFavorite}
            onReportPrice={() => setShowReportForm(true)}
            onRequireSignIn={handleRequireSignIn}
            onClose={() => setShowDetail(false)}
          />
        )}
      </SidePanel>

      {/* Report price form */}
      <Modal
        open={showReportForm && !!selectedStation}
        onClose={() => setShowReportForm(false)}
        labelledBy="report-form-title"
      >
        {selectedStation && (
          <ReportPriceForm
            station={selectedStation}
            onClose={() => setShowReportForm(false)}
            onSuccess={() => setShowReportForm(false)}
          />
        )}
      </Modal>

      {/* Sign-in / Sign-up */}
      <Modal
        open={showSignIn}
        onClose={() => {
          setShowSignIn(false);
          setSignInIntent(null);
        }}
        labelledBy="auth-modal-title"
      >
        <SignInModal
          key={authModalMode}
          initialMode={authModalMode}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          onClose={() => {
            setShowSignIn(false);
            setSignInIntent(null);
          }}
        />
      </Modal>

      {/* Live community reports feed */}
      <SidePanel
        open={showReports}
        onClose={() => {
          setShowReports(false);
          if (tab === "reports") setTab("map");
        }}
        labelledBy="reports-panel-title"
      >
        <DialogHeader
          title="Community reports"
          titleId="reports-panel-title"
          subtitle="Live prices and queues from other drivers"
          onClose={() => {
            setShowReports(false);
            if (tab === "reports") setTab("map");
          }}
        />
        <div className="min-h-0 flex-1 bg-surface">
          <ReportsFeed isAuthed={auth.isAuthed} />
        </div>
      </SidePanel>
    </div>
  );
}
