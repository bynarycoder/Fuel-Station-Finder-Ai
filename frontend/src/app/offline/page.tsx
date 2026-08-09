import Link from "next/link";
import { WifiOff } from "lucide-react";

/**
 * Offline fallback page (Phase 11 — PWA).
 *
 * Served by the service worker when navigation fails while offline. The
 * cached station catalogue remains reachable from the home page.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
      <div className="rounded-full bg-amber-100 p-4">
        <WifiOff className="h-10 w-10 text-amber-600" />
      </div>
      <h1 className="text-xl font-bold text-gray-900">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-gray-600">
        No internet connection right now. Your cached station list is still
        available — prices and reports may be out of date until you reconnect.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
      >
        Browse cached stations
      </Link>
    </main>
  );
}
