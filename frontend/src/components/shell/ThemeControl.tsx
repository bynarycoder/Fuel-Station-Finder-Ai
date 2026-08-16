"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "fuel-finder-theme";

function applyTheme(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const dark = preference === "dark" || (preference === "system" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemePreference>("system");

  useEffect(() => {
    const initial = getStoredTheme();
    setTheme(initial);
    applyTheme(initial);

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = () => applyTheme(getStoredTheme());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function choose(next: ThemePreference) {
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const options: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];

  return (
    <div className={cn("flex items-center rounded-xl border border-white/15 bg-white/10 p-1", compact && "scale-95")} aria-label="Theme preference">
      {options.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            aria-pressed={active}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-caption font-semibold transition-all",
              active ? "bg-surface text-brand-700 shadow-e1" : "text-brand-100 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className={compact ? "sr-only xl:not-sr-only" : "hidden sm:inline"}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
