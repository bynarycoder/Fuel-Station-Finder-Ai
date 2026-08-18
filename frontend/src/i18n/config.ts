import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ha from "./locales/ha.json";
import yo from "./locales/yo.json";
import ig from "./locales/ig.json";

export const SUPPORTED_LOCALES = ["en", "ha", "yo", "ig"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_STORAGE_KEY = "fuelfinder-locale";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "en" || value === "ha" || value === "yo" || value === "ig";
}

export function getStoredLocale(): AppLocale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isAppLocale(stored)) return stored;
  } catch {
    /* private mode */
  }
  return "en";
}

export function persistLocale(locale: AppLocale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* preference simply will not persist */
  }
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ha: { translation: ha },
      yo: { translation: yo },
      ig: { translation: ig },
    },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
