"use client";

/**
 * Service-worker registration (Phase 11 — PWA).
 *
 * Registers ``/sw.js`` once, on the client, guarded for production and
 * browsers that support service workers. Registration failure is non-fatal —
 * the app works identically without offline support.
 */

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // dev: keep hot reload simple
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[pwa] service worker registration failed:", err);
      });
  }, []);

  return null;
}
