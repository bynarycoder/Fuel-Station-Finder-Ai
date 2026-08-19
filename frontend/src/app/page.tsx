"use client";

/**
 * Fuel Station Finder — the finder experience.
 *
 * ONE screen, two compositions:
 *
 *   mobile (<lg)  header → search → fuel chips → MAP (majority) → nav
 *                 with floating Near me / Browse all / zoom / locate
 *   desktop (≥lg) results rail on the left, map filling the rest
 *
 * Behaviour preserved from the previous implementation:
 * - selecting a station (list, map, or AI) opens the detail panel;
 * - reporting a price requires sign-in and reopens the form afterwards;
 * - the `nearby-refresh-requested` event refetches the active query;
 * - placeholder (previous-location) nearby data never presents as current, and
 *   never crowns a "closest" station.
 * - Near me / Browse all still drive the same store actions.
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
import { StationsScreen } from "@/components/stations/StationsScreen";
import {
  BottomSheet,
  DialogHeader,
  FullPage,
  Modal,
  SidePanel,
  type SheetSnap,
} from "@/components/ui/Sheet";
import { useAuth } from "@/hooks/useAuth";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useFavorites } from "@/hooks/useFavorites";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { useStationsQuery } from "@/hooks/useStations";
import { TAB_PATH, tabFromPathname, useFinderPathname } from "@/lib/useFinderPath";
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

  // The browser URL is the source of truth for the active destination, so a
  // refresh or direct entry of /map, /stations, /ai, /report or /account
  // restores that tab (see rewrites in next.config.mjs).
  const pathname = useFinderPathname();
  const urlTab = tabFromPathname(pathname);

  const [tab, setTab] = useState<FinderTab>(urlTab);
  const [snap, setSnap] = useState<SheetSnap>("peek");
  const [showReports, setShowReports] = useState(false);
  const [showAccount, setShowAccount] = useState(urlTab === "account");
  const [showFuelAi, setShowFuelAi] = useState(urlTab === "ai");
  const [aiQuery, setAiQuery] = useState("");
  const [aiSignal, setAiSignal] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [signInIntent, setSignInIntent] = useState<"report" | null>(null);
  const [showStations, setShowStations] = useState(urlTab === "stations");

  /**
   * Apply the surface state for a destination WITHOUT touching the URL — used
   * by back/forward handling (the URL has already changed) and by internal
   * redirects that resolve one tab into another.
   */
  const applyTabSurface = useCallback((next: FinderTab) => {
    setTab(next);
    if (next === "map") {
      setSnap("peek");
      setShowStations(false);
      return;
    }
    if (next === "stations") {
      setShowStations(true);
      setSnap("peek");
      setShowFuelAi(false);
      setShowAccount(false);
      return;
    }
    if (next === "ai") {
      setShowFuelAi(true);
      setShowStations(false);
      return;
    }
    if (next === "account") {
      setShowAccount(true);
      setShowStations(false);
      return;
    }
    // report: surface itself is opened by handleTabChange after its guards.
    setShowStations(false);
    setShowFuelAi(false);
    setShowAccount(false);
  }, []);

  /**
   * Navigate to a destination and write its path to the address bar. A plain
   * `history.pushState` (rather than `router.push`) keeps the whole shell —
   * and the single mounted map — alive, so tab switches never remount it.
   * `syncUrl=false` is used for popstate, where the URL is already correct.
   */
  const navigateToTab = useCallback(
    (next: FinderTab, options: { syncUrl?: boolean; replace?: boolean } = {}) => {
      const { syncUrl = true, replace = false } = options;
      applyTabSurface(next);
      if (syncUrl && typeof window !== "undefined") {
        const url = TAB_PATH[next];
        if (window.location.pathname !== url) {
          if (replace) {
            window.history.replaceState({ tab: next }, "", url);
          } else {
            window.history.pushState({ tab: next }, "", url);
          }
        }
      }
    },
    [applyTabSurface],
  );

  /**
   * Collapse any surface back to the map. Uses `replaceState` so dismissing a
   * sheet doesn't add a redundant `/map` entry the user has to back through.
   */
  const returnToMap = useCallback(() => {
    navigateToTab("map", { replace: true });
  }, [navigateToTab]);

  // Reconcile shell state with the address bar whenever the pathname changes.
  // This single effect covers back/forward, the header brand link (which uses
  // Next's <Link> to "/"), hard-refresh/direct-entry initial state, and our
  // own history.pushState calls — the URL always wins. `applyTabSurface` is
  // idempotent, so our own navigations simply re-confirm the same surface. We
  // only reconcile when the URL's tab differs from the active tab, so closing
  // a sub-surface (detail, report form) while on the same tab is untouched.
  useEffect(() => {
    if (urlTab !== tab) applyTabSurface(urlTab);
  }, [urlTab, tab, applyTabSurface]);

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
    navigateToTab("ai");
  }, [navigateToTab]);

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
   * Tab → surface mapping. Every tab performs a real action AND updates the
   * browser URL so the destination survives refresh.
   *
   * "Report" is station-scoped (the backend requires a station_id) and
   * requires auth, so it resolves in this order: signed out → sign-in
   * (re-opening the form afterwards); no station chosen → expand the sheet so
   * the user can pick one; otherwise → open the report form.
   */
  function handleTabChange(next: FinderTab) {
    if (next === "report") {
      if (!auth.isAuthed) {
        handleRequireSignIn();
        return;
      }
      if (!selectedStation) {
        // Nothing to report against yet — open the stations screen so the
        // user can pick one, instead of an empty form they cannot submit.
        navigateToTab("stations");
        return;
      }
      navigateToTab("report");
      setShowReportForm(true);
      return;
    }
    navigateToTab(next);
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

  // Floating map actions (zoom / locate / Near me / Browse all) sit ABOVE
  // the bottom sheet at whatever height the user has dragged it to.
  //
  // Peek uses a fixed 120 px offset (spec: right/left 16 px, bottom 120 px)
  // so the collapsed 80–120 px sheet never covers the controls. Half / full
  // still track SHEET_SNAP_PERCENT. Literals are written out in full —
  // Tailwind only emits arbitrary values it can see as static strings.
  const FLOATING_OFFSET: Record<SheetSnap, string> = {
    peek: "bottom-[120px]",
    half: "bottom-[calc(52%+0.75rem)]",
    full: "bottom-[calc(92%+0.75rem)]",
  };

  const openStationsScreen = useCallback(() => {
    navigateToTab("stations");
  }, [navigateToTab]);

  const mapSurface = (
    <StationMap
      items={items}
      userLocation={userLocation}
      selectedStationId={selectedStationId}
      isNearby={isNearby}
      closestStationId={closestStationId}
      onSelect={handleSelect}
      controlsClassName={`${FLOATING_OFFSET[snap]} lg:bottom-4`}
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
        onOpenAccount={() => navigateToTab("account")}
      />

      <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
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
            <StationFilters
              onChooseLocation={handleChooseLocation}
              onBrowseAll={openStationsScreen}
            />
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
                onClick={() => navigateToTab("ai")}
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

        {/* ---------------------------------------------- mobile chrome ---
             OVERLAY: search + chips sit ON the map (map is the background).
             Document order stays search → chips → Near me → map. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-mapctl lg:hidden">
          <div className="pointer-events-auto space-y-1.5 bg-gradient-to-b from-canvas from-55% via-canvas/75 to-transparent px-3 pb-2.5 pt-2 shorty:space-y-1 shorty:pb-2">
            <SearchBar
              compact
              value={filters.q}
              onSearch={handleSearch}
              onAsk={handleAsk}
              placeholder="Search stations, areas or fuel..."
            />
            <FuelFilterChips compact />
          </div>
        </div>

        {/* -------------------------- ONE map surface, at every viewport ---
             Exactly one <StationMap> is mounted regardless of breakpoint; the
             mobile/desktop differences are pure CSS/layout around it. Two
             simultaneously-mounted Leaflet maps (one hidden in a 0×0
             container) is what crashed `flyTo` with `(NaN, NaN)`. */}
        <section aria-label="Station map" className="relative min-h-0 flex-1">
          {/* Floating Near me / Browse all — BEFORE the map in the DOM so
              the map-first order contract holds, but absolutely positioned
              so they never push the map down. */}
          <StationFilters
            floating
            className="lg:hidden"
            onChooseLocation={handleChooseLocation}
            onBrowseAll={openStationsScreen}
            actionsClassName={FLOATING_OFFSET[snap]}
          />

          {mapSurface}

          {/* Mobile bottom sheet layered over the same map (CSS-only mobile). */}
          <BottomSheet
            snap={snap}
            onSnapChange={setSnap}
            title="Nearby stations"
            className="lg:hidden"
          >
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="min-w-0 truncate text-body-sm font-bold text-ink-900 sm:text-h3">
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
                {/* Peek stays a summary. "See all" opens the stations screen
                    (map stays mounted underneath). "Show map" only appears
                    after the user has dragged the sheet up. Compact height so
                    the 80–120 px peek never clips the row. */}
                <button
                  type="button"
                  onClick={() =>
                    snap === "peek" ? openStationsScreen() : setSnap("peek")
                  }
                  className="shrink-0 rounded-lg px-2 py-1 text-body-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                >
                  {snap === "peek" ? "See all" : "Show map"}
                </button>
              </div>

              {needsLocationPrimer && snap !== "peek" && (
                <LocationPrimer
                  compact
                  loading={isLocating}
                  onUseLocation={() => void requestLocation()}
                  onSearchManually={handleChooseLocation}
                />
              )}

              {/* Collapsed peek is a summary only — the list appears if the
                  user drags the sheet up. "See all" opens the stations screen. */}
              {snap !== "peek" && (
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
              )}
            </div>
          </BottomSheet>
        </section>
      </main>

      <MobileBottomNav
        active={tab}
        onChange={handleTabChange}
        stationCount={items.length}
      />

      {/* --------------------------------------------------- overlays ------ */}

      {/* Stations screen — station-focused browsing, map stays mounted. */}
      <FullPage
        open={showStations && !isDesktop}
        onClose={() => {
          setShowStations(false);
          if (tab === "stations") returnToMap();
        }}
        labelledBy="stations-screen-title"
      >
        <StationsScreen
          items={items}
          isLoading={showLoading}
          isError={isError}
          isNearby={isNearby}
          selectedId={selectedStationId}
          userLocation={userLocation}
          showLoading={showLoading}
          needsLocationPrimer={needsLocationPrimer}
          isLocating={isLocating}
          favoriteIds={favorites.favoriteIds}
          searchValue={filters.q}
          onSearch={handleSearch}
          onAsk={(q) => {
            setShowStations(false);
            handleAsk(q);
          }}
          onSelect={(id) => {
            setShowStations(false);
            returnToMap();
            handleSelect(id);
          }}
          onRetry={() => void refetch()}
          onToggleFavorite={handleToggleFavorite}
          onExpandRadius={handleExpandRadius}
          onClearFilters={handleClearFilters}
          onChooseLocation={handleChooseLocation}
          onUseLocation={() => void requestLocation()}
          onClose={() => {
            setShowStations(false);
            if (tab === "stations") returnToMap();
          }}
        />
      </FullPage>

      {/* Fuel Intelligence — full-viewport page on mobile, inline on desktop */}
      <FullPage
        open={showFuelAi && !isDesktop}
        onClose={() => {
          setShowFuelAi(false);
          if (tab === "ai") returnToMap();
        }}
        labelledBy="ai-sheet-title"
      >
        <h2 id="ai-sheet-title" className="sr-only">
          Fuel Intelligence
        </h2>
        <FuelIntelligence
          fullScreen
          onViewStation={(id) => {
            setShowFuelAi(false);
            if (tab === "ai") returnToMap();
            handleSelect(id);
          }}
          onClose={() => {
            setShowFuelAi(false);
            if (tab === "ai") returnToMap();
          }}
          initialQuery={aiQuery}
          querySignal={aiSignal}
          onChooseLocation={handleChooseLocation}
        />
      </FullPage>

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

      {/* Report price form — full page on mobile, modal card on desktop */}
      {isDesktop ? (
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
      ) : (
        <FullPage
          open={showReportForm && !!selectedStation}
          onClose={() => setShowReportForm(false)}
          labelledBy="report-form-title"
        >
          {selectedStation && (
            <ReportPriceForm
              station={selectedStation}
              onClose={() => setShowReportForm(false)}
              onSuccess={() => setShowReportForm(false)}
              fullScreen
            />
          )}
        </FullPage>
      )}

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

      {/* Account / profile — full page on mobile, drawer on desktop */}
      {(() => {
        const account = (
          <>
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
                if (tab === "account") returnToMap();
              }}
              onOpenMyReports={() => {
                setShowAccount(false);
                setShowReports(true);
              }}
              onOpenSavedStations={() => {
                setShowAccount(false);
                setFavoritesOnly(true);
                setSnap("peek");
                navigateToTab("stations");
              }}
              onClose={() => {
                setShowAccount(false);
                if (tab === "account") returnToMap();
              }}
            />
          </>
        );
        const closeAccount = () => {
          setShowAccount(false);
          if (tab === "account") returnToMap();
        };
        return isDesktop ? (
          <SidePanel open={showAccount} onClose={closeAccount} labelledBy="account-panel-title">
            {account}
          </SidePanel>
        ) : (
          <FullPage open={showAccount} onClose={closeAccount} labelledBy="account-panel-title">
            {account}
          </FullPage>
        );
      })()}

      {/* Live community reports feed */}
      <SidePanel
        open={showReports}
        onClose={() => {
          setShowReports(false);
          if (tab !== "map") returnToMap();
        }}
        labelledBy="reports-panel-title"
      >
        <DialogHeader
          title="Community reports"
          titleId="reports-panel-title"
          subtitle="Live prices and queues from other drivers"
          onClose={() => {
            setShowReports(false);
            if (tab !== "map") returnToMap();
          }}
        />
        <div className="min-h-0 flex-1 bg-surface">
          <ReportsFeed isAuthed={auth.isAuthed} />
        </div>
      </SidePanel>
    </div>
  );
}
