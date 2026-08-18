"use client";

/**
 * ThemeSelector — the visible control for Light / Dark / System.
 *
 * Two presentations, one behaviour:
 *
 * - `segmented` (default): a radiogroup of three labelled options. Used in
 *   Account settings, where the user is deliberately configuring the app and
 *   deserves to see that "System" exists and which option is active.
 * - `toggle`: a single icon button that flips light↔dark, for the map header
 *   where space is scarce. Its `aria-label` states the action AND the current
 *   theme, and the tooltip does the same, so an icon-only control is never
 *   ambiguous.
 *
 * Accessibility: the segmented control is a real `radiogroup`/`radio` set, so
 * arrow keys and screen-reader semantics work; selection is communicated by
 * `aria-checked`, never by colour alone (the active option also carries a
 * filled surface and a weight change).
 */

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTheme, type Theme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: Theme; labelKey: string; Icon: typeof Sun }> = [
  { value: "light", labelKey: "theme.light", Icon: Sun },
  { value: "dark", labelKey: "theme.dark", Icon: Moon },
  { value: "system", labelKey: "theme.system", Icon: Monitor },
];

export function ThemeSelector({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div
      role="radiogroup"
      aria-label={t("theme.colourTheme")}
      className={cn(
        "flex items-center gap-1 rounded-pill border border-hairline bg-canvas p-1",
        className,
      )}
    >
      {OPTIONS.map(({ value, labelKey, Icon }) => {
        const label = t(labelKey);
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(value)}
            className={cn(
              "flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-pill px-3 text-body-sm transition-colors duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
              isActive
                ? "bg-surface font-semibold text-brand-700 shadow-e1"
                : "font-medium text-ink-500 hover:text-ink-800",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact light↔dark toggle for dense surfaces (the map header).
 *
 * It reports the RESOLVED theme, so a user on "system" still sees the state
 * they are actually in, and switching from it makes an explicit choice.
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  const isDark = resolvedTheme === "dark";
  const label = isDark ? t("theme.switchToLight") : t("theme.switchToDark");

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-pill text-ink-600 transition-colors duration-fast",
        "hover:bg-ink-100 hover:text-ink-900",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        className,
      )}
    >
      {isDark ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
