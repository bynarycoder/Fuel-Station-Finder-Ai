"use client";

/**
 * Client-safe relative time component.
 *
 * Renders deterministic markup on server and first client render (empty
 * placeholder), then calculates Date.now() only after mounting inside
 * useEffect. Avoids hydration mismatch caused by Date.now() during SSR.
 *
 * Updates every 60s and cleans up timer on unmount.
 */

import { useEffect, useState } from "react";
import { formatRelative } from "@/lib/format";

interface RelativeTimeProps {
  iso: string;
  className?: string;
}

export function RelativeTime({ iso, className }: RelativeTimeProps) {
  const [text, setText] = useState("");

  useEffect(() => {
    const update = () => {
      setText(formatRelative(iso, Date.now()));
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [iso]);

  // Deterministic initial render: same on server and first client render.
  // Once mounted, effect fills actual relative time.
  // No suppressHydrationWarning needed because initial is identical.
  if (!text) {
    return <span className={className} />;
  }

  return <span className={className}>{text}</span>;
}
