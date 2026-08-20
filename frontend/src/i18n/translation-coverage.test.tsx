/**
 * UI translation coverage contract.
 *
 * PR #47 wired the i18n runtime; this suite guards the copy that was then
 * threaded through it. Three properties matter, in this order:
 *
 *  1. English is byte-identical to the copy that shipped before the keys
 *     existed. Every string listed in ENGLISH_CONTRACT is asserted verbatim,
 *     so a well-meaning "improvement" to en.json fails here rather than in a
 *     downstream string-matching test (or in front of a user).
 *  2. Hausa, Yoruba and Igbo define exactly the same key set as English —
 *     no missing key silently falling back to English, no orphan keys.
 *  3. Switching locale actually re-renders chrome, and switching back to
 *     English restores the original words.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SearchBar } from "@/components/search/SearchBar";
import i18n, { SUPPORTED_LOCALES } from "@/i18n/config";
import en from "@/i18n/locales/en.json";
import ha from "@/i18n/locales/ha.json";
import ig from "@/i18n/locales/ig.json";
import yo from "@/i18n/locales/yo.json";

/**
 * The exact English words the product shipped with. These are the strings
 * other tests match on, plus the ones users read on the critical paths
 * (location, reporting, auth). They must never drift.
 */
const ENGLISH_CONTRACT: Record<string, string> = {
  // Search
  "search.placeholder": "Search stations, areas or fuel...",
  "search.inputLabel": "Search stations or ask Fuel Intelligence",
  "search.clear": "Clear search",
  // Station filters — load-bearing button labels
  "filters.nearMe": "Near me",
  "filters.locating": "Locating…",
  "filters.trackingYou": "Tracking you",
  "filters.startTracking": "Start tracking",
  "filters.browseAll": "Browse all",
  "filters.recenter": "Recenter on Me",
  "filters.filters": "Filters",
  // Location state machine
  "location.couldNotGet": "Could not get your location",
  "location.trackingPaused": "Live tracking paused",
  "location.lastKnown": "Using your last known location",
  "location.usingSelected": "Using selected location",
  "location.coarseTitle": "We couldn't get an accurate location",
  "location.searchByCity": "Search by city",
  "location.chooseALocation": "Choose a location",
  "location.tryAgain": "Try again",
  // Errors
  "errors.somethingWentWrong": "Something went wrong",
  "errors.tryAgain": "Try again",
  "errors.checkConnection": "Please check your connection and try again.",
  // Report flow
  "report.submit": "Submit Report",
  "report.title": "Report Fuel Price",
  "report.submittedTitle": "Report submitted",
  "report.thankYou": "Thank you for helping other drivers",
  "report.browsePhotos": "Browse photos",
  "report.continue": "Continue",
  // Auth
  "auth.signIn": "Sign in",
  "auth.createAccount": "Create account",
  "auth.signUp": "Sign up",
  // Fuel chips — labels are translated, codes never are
  "fuel.all": "All",
  "fuel.petrol": "Petrol",
  "fuel.diesel": "Diesel",
  "fuel.lpg": "LPG",
  "fuel.cng": "CNG",
  "fuel.groupLabel": "Filter by fuel type",
  "fuel.allTypes": "all fuel types",
  // Fuel Intelligence chrome
  "ai.title": "Fuel AI Assistant",
  "ai.composerLabel": "Ask Fuel AI",
  "ai.sendLabel": "Ask Fuel AI — send message",
  "ai.close": "Close Fuel Intelligence",
  "ai.errorTitle": "The Fuel AI hit a snag",
};

/** Flattens a nested translation object to dotted keys. */
function flatten(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of flatten(value as Record<string, unknown>, path)) {
        keys.add(nested);
      }
    } else {
      keys.add(path);
    }
  }
  return keys;
}

afterEach(async () => {
  // Never leak a locale into another test file's expectations.
  await i18n.changeLanguage("en");
});

describe("English copy is unchanged", () => {
  it.each(Object.entries(ENGLISH_CONTRACT))(
    "%s is exactly the pre-i18n string",
    (key, expected) => {
      expect(i18n.getFixedT("en")(key)).toBe(expected);
    },
  );

  it("uses no fallback for these keys — they really exist in en.json", () => {
    const englishKeys = flatten(en as Record<string, unknown>);
    for (const key of Object.keys(ENGLISH_CONTRACT)) {
      expect(englishKeys.has(key)).toBe(true);
    }
  });
});

describe("Locale parity", () => {
  const bundles = { ha, yo, ig } as Record<string, Record<string, unknown>>;
  const englishKeys = flatten(en as Record<string, unknown>);

  it.each(Object.keys(bundles))(
    "%s defines exactly the same keys as English",
    (locale) => {
      const localeKeys = flatten(bundles[locale]);
      const missing = [...englishKeys].filter((k) => !localeKeys.has(k));
      const extra = [...localeKeys].filter((k) => !englishKeys.has(k));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    },
  );

  it.each(Object.keys(bundles))("%s leaves no value empty", (locale) => {
    const flat = bundles[locale];
    const empties: string[] = [];
    const walk = (obj: Record<string, unknown>, prefix = "") => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === "object") {
          walk(value as Record<string, unknown>, path);
        } else if (typeof value !== "string" || value.trim() === "") {
          empties.push(path);
        }
      }
    };
    walk(flat);
    expect(empties).toEqual([]);
  });

  it("still exposes exactly the four product locales", () => {
    expect([...SUPPORTED_LOCALES]).toEqual(["en", "ha", "yo", "ig"]);
  });
});

describe("Switching locale re-renders chrome", () => {
  function renderSearch() {
    return render(
      <SearchBar value="" onSearch={() => {}} onAsk={() => {}} />,
    );
  }

  it("renders English by default, then Hausa, then English again", async () => {
    const { unmount } = renderSearch();
    expect(
      screen.getByPlaceholderText("Search stations, areas or fuel..."),
    ).toBeInTheDocument();
    unmount();

    await i18n.changeLanguage("ha");
    const hausa = renderSearch();
    expect(
      screen.getByPlaceholderText(i18n.getFixedT("ha")("search.placeholder")),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search stations, areas or fuel..."),
    ).toBeNull();
    hausa.unmount();

    await i18n.changeLanguage("en");
    renderSearch();
    expect(
      screen.getByPlaceholderText("Search stations, areas or fuel..."),
    ).toBeInTheDocument();
  });

  it.each(["ha", "yo", "ig"])(
    "%s translates the search chrome away from English",
    async (locale) => {
      const t = i18n.getFixedT(locale);
      expect(t("search.placeholder")).not.toBe(
        ENGLISH_CONTRACT["search.placeholder"],
      );
      expect(t("filters.nearMe")).not.toBe(ENGLISH_CONTRACT["filters.nearMe"]);
      expect(t("report.submit")).not.toBe(ENGLISH_CONTRACT["report.submit"]);
    },
  );

  it("an explicit placeholder prop still wins over the localised default", () => {
    render(
      <SearchBar
        value=""
        onSearch={() => {}}
        onAsk={() => {}}
        placeholder="Caller supplied"
      />,
    );
    expect(screen.getByPlaceholderText("Caller supplied")).toBeInTheDocument();
  });
});
