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
import { Sparkles } from "lucide-react";

import { AccountPanel } from "@/components/account/AccountPanel";
import { FuelIntelligence } from "@/components/ai/FuelIntelligence";
import { SignInModal } from "@/components/auth/SignInModal";
import { LocationPicker, type PickedLocation } from "@/components/location/LocationPicker";
import StationMap from "@/components/map/StationMap";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ReportPriceForm } from "@/components/reports/ReportPriceForm";
import { ReportsFeed } from "@/components/reports/ReportsFeed";
import { SearchBar } from "@/components/search/SearchBar";
import { AppHeader } from "@/components/shell/AppHeader";
import { MobileBottomNav, type FinderTab } from "@/components/shell/MobileBottomNav";
import { FuelFilterChips } from "@/components/stations/FuelFilterChips";
import { LocationPrimer } from "@/components/stations/LocationPrimer";
import { StationDetail } from "@/components/stations/StationDetail";
import { StationFilters } from "@/components/stations/StationFilters";
import { StationList } from "@/components/stations/StationList";
import {
  BottomSheet,
  DialogHeader,
  Modal,
  SidePanel,
  type SheetSnap,
} from "@/components/ui/Sheet";
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
  const setManualLocation = useMapStore((s) => s.setManualLocation);
  const locationStatus = useMapStore((s) => s.locationStatus);

  const { searches, recordSearch, clearSearches } = useRecentSearches();
  // The AI surface is an inline panel on desktop and a sheet on mobile — a
  // behavioural difference, so it is resolved in JS rather than with
  // `lg:hidden` (which would leave a duplicate dialog mounted).
  const isDesktop = useIsDesktop();

  const [tab, setTab] = useState<FinderTab>("map");
  const [snap, setSnap] = useState<SheetSnap>("peek");
  const [showReports, setShowReports] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showFuelAi, setShowFuelAi] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiSignal, setAiSignal] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
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

  /** Open the shared location picker (manual city/point selection). */
  const handleChooseLocation = useCallback(() => {
    setShowLocationPicker(true);
  }, []);

  /**
   * Manual location confirmation — flows through the store's single owner
   * (`setManualLocation`): stored with `locationSource: "manual"`, nearby
   * mode entered, NO watcher started. Never invents or defaults coordinates.
   */
  const handleConfirmLocation = useCallback(
    (location: PickedLocation) => {
      setManualLocation(
        { latitude: location.latitude, longitude: location.longitude },
        location.label,
      );
      setShowLocationPicker(false);
    },
    [setManualLocation],
  );

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

  /**
   * Mobile tab → surface mapping. Every tab performs a real action.
   *
   * "Report" is station-scoped (the backend requires a station_id) and
   * requires auth, so it resolves in this order: signed out → sign-in
   * (re-opening the form afterwards); no station chosen → expand the sheet so
   * the user can pick one; otherwise → open the report form.
   */
  function handleTabChange(next: FinderTab) {
    setTab(next);
    if (next === "map") setSnap("peek");
    if (next === "ai") setShowFuelAi(true);
    if (next === "account") setShowAccount(true);
    if (next === "report") {
      if (!auth.isAuthed) {
        handleRequireSignIn();
        return;
      }
      if (!selectedStation) {
        // Nothing to report against yet — surface the list instead of
        // opening an empty form the user cannot submit.
        setSnap("full");
        return;
      }
      setShowReportForm(true);
    }
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

  // The map's floating controls must sit ABOVE the bottom sheet at whatever
  // height the user has dragged it to. A fixed offset (the sheet's "peek"
  // height) left zoom/locate buried under the sheet as soon as it was
  // expanded — on a phone that hid the only way to recentre the map.
  //
  // The literals below MUST match `SHEET_SNAP_PERCENT` (the sheet's own snap
  // heights). They are written out in full rather than interpolated because
  // Tailwind only generates arbitrary values it can see as static strings —
  // `page.mobile.test.tsx` asserts the two stay in sync.
  const CONTROLS_OFFSET: Record<SheetSnap, string> = {
    peek: "bottom-[calc(42%+0.75rem)] shorty:bottom-[calc(34%+0.75rem)]",
    half: "bottom-[calc(68%+0.75rem)]",
    full: "bottom-[calc(92%+0.75rem)]",
  };

  const mapSurface = (
    <StationMap
      items={items}
      userLocation={userLocation}
      selectedStationId={selectedStationId}
      isNearby={isNearby}
      closestStationId={closestStationId}
      onSelect={handleSelect}
      controlsClassName={`${CONTROLS_OFFSET[snap]} lg:bottom-4`}
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
        onOpenAccount={() => setShowAccount(true)}
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
            <FuelFilterChips />
            <StationFilters onChooseLocation={handleChooseLocation} />
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {needsLocationPrimer && (
              <LocationPrimer
                loading={isLocating}
                onUseLocation={() => void requestLocation()}
                onSearchManually={handleChooseLocation}
              />
            )}

            {showFuelAi && isDesktop && (
              <FuelIntelligence
                onViewStation={handleSelect}
                onClose={() => setShowFuelAi(false)}
                initialQuery={aiQuery}
                querySignal={aiSignal}
                onChooseLocation={handleChooseLocation}
              />
            )}

            {!(showFuelAi && isDesktop) && (
              <button
                type="button"
                onClick={() => setShowFuelAi(true)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-brand-200 bg-brand-50/60 px-3.5 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-action text-action-fg">
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

        {/* ---------------------------------------------- mobile header ---
             MAP-FIRST: this stack is deliberately three compact rows —
             search, fuel chips, actions — so the map below it owns the rest
             of the viewport. Horizontal padding drops to 12 px under 375 px
             (spec §24, Mobile S) and every row scrolls sideways rather than
             clipping, so CNG and "Filters" stay reachable at 320 px. */}
        <div className="shrink-0 space-y-2 border-b border-hairline bg-surface px-3 pb-2 pt-2 shorty:space-y-1.5 shorty:pb-1.5 shorty:pt-1.5 sm:px-4 sm:pb-3 lg:hidden">
          <SearchBar
            value={filters.q}
            onSearch={handleSearch}
            onAsk={handleAsk}
            placeholder="Search stations, areas or fuel..."
          />
          {/* Reference: one-tap fuel chips directly under the search field. */}
          <FuelFilterChips />
          <StationFilters compact onChooseLocation={handleChooseLocation} />
        </div>

        {/* -------------------------- ONE map surface, at every viewport ---
             Exactly one <StationMap> is mounted regardless of breakpoint; the
             mobile/desktop differences are pure CSS/layout around it. Two
             simultaneously-mounted Leaflet maps (one hidden in a 0×0
             container) is what crashed `flyTo` with `(NaN, NaN)`. */}
        <section aria-label="Station map" className="relative min-h-0 flex-1">
          {mapSurface}

          {/* Mobile bottom sheet layered over the same map (CSS-only mobile). */}
          <BottomSheet
            snap={snap}
            onSnapChange={setSnap}
            title="Nearby stations"
            className="lg:hidden"
          >
            <div className="space-y-2.5 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 className="truncate text-h3 text-ink-900">
                    {isNearby ? "Nearby stations" : "All stations"}
                  </h2>
                  <span
                    className="shrink-0 rounded-pill bg-brand-50 px-2 py-0.5 text-caption font-semibold text-brand-700"
                    aria-live="polite"
                  >
                    {showLoading ? "Searching…" : items.length}
                    {!showLoading && (
                      <span className="sr-only">
                        {" "}
                        station{items.length === 1 ? "" : "s"} found
                      </span>
                    )}
                  </span>
                </div>
                {/* "See all" expands the sheet rather than navigating away —
                    the map must stay mounted and behind it. */}
                <button
                  type="button"
                  onClick={() => setSnap(snap === "full" ? "peek" : "full")}
                  className="shrink-0 rounded-lg px-2 py-2 text-body-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 pointer-coarse:min-h-touch"
                >
                  {snap === "full" ? "Show map" : "See all"}
                </button>
              </div>

              {needsLocationPrimer && (
                <LocationPrimer
                  compact
                  loading={isLocating}
                  onUseLocation={() => void requestLocation()}
                  onSearchManually={handleChooseLocation}
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
            onChooseLocation={handleChooseLocation}
          />
        </div>
      </Modal>

      {/* Location picker — manual fallback (page-level, never nested in a
          modal so its own focus trap stays clean). */}
      <LocationPicker
        open={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onConfirm={handleConfirmLocation}
      />

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

      {/* Account / profile */}
      <SidePanel
        open={showAccount}
        onClose={() => {
          setShowAccount(false);
          if (tab === "account") setTab("map");
        }}
        labelledBy="account-panel-title"
      >
        <h2 id="account-panel-title" className="sr-only">
          Account
        </h2>
        <AccountPanel
          user={auth.user}
          isAuthed={auth.isAuthed}
          isAuthAvailable={auth.isAuthAvailable}
          isAdmin={auth.user?.role === "admin"}
          favoriteCount={favorites.favoriteIds.size}
          onSignIn={() => {
            setShowAccount(false);
            setAuthModalMode("signin");
            setSignInIntent(null);
            setShowSignIn(true);
          }}
          onSignUp={() => {
            setShowAccount(false);
            setAuthModalMode("signup");
            setSignInIntent(null);
            setShowSignIn(true);
          }}
          onSignOut={() => {
            void auth.signOut();
            setShowAccount(false);
            if (tab === "account") setTab("map");
          }}
          onOpenMyReports={() => {
            setShowAccount(false);
            setShowReports(true);
          }}
          onOpenSavedStations={() => {
            setShowAccount(false);
            setFavoritesOnly(true);
            setSnap("full");
            if (tab === "account") setTab("map");
          }}
          onClose={() => {
            setShowAccount(false);
            if (tab === "account") setTab("map");
          }}
        />
      </SidePanel>

      {/* Live community reports feed */}
      <SidePanel
        open={showReports}
        onClose={() => {
          setShowReports(false);
          if (tab !== "map") setTab("map");
        }}
        labelledBy="reports-panel-title"
      >
        <DialogHeader
          title="Community reports"
          titleId="reports-panel-title"
          subtitle="Live prices and queues from other drivers"
          onClose={() => {
            setShowReports(false);
            if (tab !== "map") setTab("map");
          }}
        />
        <div className="min-h-0 flex-1 bg-surface">
          <ReportsFeed isAuthed={auth.isAuthed} />
        </div>
      </SidePanel>
    </div>
  );
}
