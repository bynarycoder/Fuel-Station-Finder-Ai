import { describe, expect, it } from "vitest";

import i18n, { isAppLocale, SUPPORTED_LOCALES } from "@/i18n/config";

describe("i18n defaults", () => {
  it("defaults to English and keeps current chrome copy", () => {
    expect(i18n.language === "en" || i18n.options.fallbackLng).toBeTruthy();
    expect(i18n.t("nav.signIn")).toBe("Sign in");
    expect(i18n.t("nav.createAccount")).toBe("Create account");
    expect(i18n.t("errors.tryAgain")).toBe("Try again");
    expect(i18n.t("theme.dark")).toBe("Dark");
  });

  it("supports the four product locales", () => {
    expect([...SUPPORTED_LOCALES]).toEqual(["en", "ha", "yo", "ig"]);
    expect(isAppLocale("ha")).toBe(true);
    expect(isAppLocale("fr")).toBe(false);
  });
});
