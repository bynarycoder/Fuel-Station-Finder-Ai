"use client";

/**
 * Fuel Station Finder — interactive map home.
 *
 * Orchestrates the filter bar, the station list, the Leaflet map, a live
 * "Community reports" feed, and the station-details panel (home of the
 * "Report fuel price" action). Selecting a station from the list or map opens
 * its details; reporting a price requires sign-in (the backend enforces auth).
 */

import Link from "next/link";
import { useState } from "react";
import { Flame, Info, LogOut, MessageSquare, User, UserPlus, X } from "lucide-react";

import { SignInModal } from "@/components/auth/SignInModal";
import StationMap from "@/components/map/StationMap";
import { ReportPriceForm } from "@/components/reports/ReportPriceForm";
import { ReportsFeed } from "@/components/reports/ReportsFeed";
import { StationDetail } from "@/components/stations/StationDetail";
import { StationFilters } from "@/components/stations/StationFilters";
import { StationList } from "@/components/stations/StationList";
import { useAuth } from "@/hooks/useAuth";
import { useStationsQuery } from "@/hooks/useStations";
import { useMapStore } from "@/store/useMapStore";

export default function FinderPage() {
  const { items, isLoading, isError, refetch, isNearby } = useStationsQuery();
  const userLocation = useMapStore((s) => s.userLocation);
  const selectedStationId = useMapStore((s) => s.selectedStationId);
  const setSelectedStationId = useMapStore((s) => s.setSelectedStationId);
  const auth = useAuth();

  const [showReports, setShowReports] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  // Track which tab the auth modal should open on.
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  // When sign-in is triggered from "Report price", reopen the form afterwards.
  const [signInIntent, setSignInIntent] = useState<"report" | null>(null);

  const selectedStation = items.find((s) => s.id === selectedStationId) ?? null;

  function handleSelect(id: string) {
    setSelectedStationId(id);
    setShowDetail(true);
  }

  function handleRequireSignIn() {
    setAuthModalMode("signin");
    setSignInIntent("report");
    setShowSignIn(true);
  }

  async function handleSignIn(email: string, password: string) {
    await auth.signIn(email, password);
    setShowSignIn(false);
    if (signInIntent === "report") {
      setShowReportForm(true);
    }
    setSignInIntent(null);
  }

  async function handleSignUp(email: string, password: string) {
    const result = await auth.signUp(email, password);
    if (result.isSignedIn) {
      setShowSignIn(false);
      if (signInIntent === "report") {
        setShowReportForm(true);
      }
      setSignInIntent(null);
    }
    // When email confirmation is required the modal stays open and shows the
    // "check your email" notice (handled inside SignInModal).
    return result;
  }

  return (
    <main className="flex h-screen flex-col bg-gray-50">
      <header className="z-[1000] flex items-center justify-between border-b-4 border-amber-500 bg-emerald-900 px-4 py-3 text-white shadow-md sm:px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-500 p-2 shadow-inner">
            <Flame className="h-5 w-5 animate-pulse text-emerald-950" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight sm:text-lg">
              Fuel Station Finder AI
            </h1>
            <p className="text-[11px] text-emerald-200">
              Find fuel across Nigeria — live map &amp; nearby search
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReports(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-amber-400"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Live reports
          </button>

          {auth.ready && auth.isAuthed ? (
            <button
              type="button"
              onClick={() => auth.signOut()}
              className="inline-flex max-w-[140px] items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-950"
              title={auth.user?.email}
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{auth.user?.email?.split("@")[0]}</span>
            </button>
          ) : auth.ready && auth.isAuthAvailable ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode("signin");
                  setSignInIntent(null);
                  setShowSignIn(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-950"
              >
                <User className="h-3.5 w-3.5" /> Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode("signup");
                  setSignInIntent(null);
                  setShowSignIn(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-amber-400"
              >
                <UserPlus className="h-3.5 w-3.5" /> Create Account
              </button>
            </>
          ) : null}

          <Link
            href="/about"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-950"
          >
            <Info className="h-3.5 w-3.5" /> About
          </Link>
        </div>
      </header>

      <div className="shrink-0 space-y-3 p-4">
        <StationFilters />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-4 pb-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <section className="order-2 min-h-0 lg:order-1">
          <StationList
            items={items}
            isLoading={isLoading}
            isError={isError}
            isNearby={isNearby}
            selectedId={selectedStationId}
            userLocation={userLocation}
            onSelect={handleSelect}
            onRetry={() => void refetch()}
          />
        </section>

        <section className="order-1 isolate h-[55vh] min-h-0 overflow-hidden rounded-2xl border border-gray-200 shadow-sm lg:order-2 lg:h-full">
          <StationMap
            items={items}
            userLocation={userLocation}
            selectedStationId={selectedStationId}
            isNearby={isNearby}
            onSelect={handleSelect}
          />
        </section>
      </div>

      {/* Station details (home of "Report fuel price") */}
      {showDetail && selectedStation && (
        <SlideOver onClose={() => setShowDetail(false)}>
          <StationDetail
            station={selectedStation}
            userLocation={userLocation}
            isAuthed={auth.isAuthed}
            onReportPrice={() => setShowReportForm(true)}
            onRequireSignIn={handleRequireSignIn}
            onClose={() => setShowDetail(false)}
          />
        </SlideOver>
      )}

      {/* Report price form */}
      {showReportForm && selectedStation && (
        <CenteredModal onClose={() => setShowReportForm(false)}>
          <ReportPriceForm
            station={selectedStation}
            onClose={() => setShowReportForm(false)}
            onSuccess={() => setShowReportForm(false)}
          />
        </CenteredModal>
      )}

      {/* Sign-in / Sign-up */}
      {showSignIn && (
        <CenteredModal onClose={() => { setShowSignIn(false); setSignInIntent(null); }}>
          <SignInModal
            key={authModalMode}
            initialMode={authModalMode}
            onSignIn={handleSignIn}
            onSignUp={handleSignUp}
            onClose={() => { setShowSignIn(false); setSignInIntent(null); }}
          />
        </CenteredModal>
      )}

      {/* Live community reports feed */}
      {showReports && (
        <SlideOver onClose={() => setShowReports(false)}>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-end p-2">
              <button
                type="button"
                onClick={() => setShowReports(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 border-t border-gray-200 bg-white">
              <ReportsFeed />
            </div>
          </div>
        </SlideOver>
      )}
    </main>
  );
}

function SlideOver({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[2000] flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 cursor-default bg-black/40"
      />
      <aside className="flex h-full w-full max-w-md flex-col bg-gray-50 shadow-2xl">
        {children}
      </aside>
    </div>
  );
}

function CenteredModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {children}
      </div>
    </div>
  );
}
