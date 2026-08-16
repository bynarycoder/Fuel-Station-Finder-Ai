import Link from "next/link";
import { WifiOff } from "lucide-react";

/**
 * Offline fallback page (PWA).
 *
 * Served by the service worker when navigation fails while offline. The
 * cached station catalogue remains reachable from the home page.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-warning-soft text-warning-strong">
        <WifiOff className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1 className="text-h1 text-ink-900">You&apos;re offline</h1>
      <p className="max-w-sm text-body text-ink-600">
        No internet connection right now. Your cached station list is still
        available — prices and reports may be out of date until you reconnect.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex h-12 items-center rounded-lg bg-action px-5 text-body-sm font-semibold text-action-fg shadow-e1 transition-colors hover:bg-brand-800"
      >
        Browse cached stations
      </Link>
    </main>
  );
}
