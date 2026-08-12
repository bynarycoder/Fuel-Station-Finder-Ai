"use client";

/**
 * Offline-mode banner (Phase 11 — PWA).
 *
 * Shows when the browser reports the network is down. Cached station data
 * (served by the service worker) remains usable; the banner makes it clear
 * the data may be stale and is not "live".
 */

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  // Deterministic initial state for SSR – server and client first render both false.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Determine actual online status only after mount (client-only).
    setOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);

    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-xs font-semibold text-amber-900"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>
        Offline mode — showing cached stations. Live prices and reports may be
        out of date until you reconnect.
      </span>
    </div>
  );
}
