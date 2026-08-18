"use client";

import { useTranslation } from "react-i18next";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSelector({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();

  return (
    <div
      role="radiogroup"
      aria-label={t("language.label")}
      className={cn(
        "grid grid-cols-2 gap-1 rounded-xl border border-hairline bg-canvas p-1 sm:grid-cols-4",
        className,
      )}
    >
      {SUPPORTED_LOCALES.map((code) => {
        const isActive = locale === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setLocale(code as AppLocale)}
            className={cn(
              "flex min-h-touch items-center justify-center rounded-lg px-2 py-1.5 text-body-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
              isActive
                ? "bg-surface font-semibold text-brand-700 shadow-e1"
                : "font-medium text-ink-500 hover:text-ink-800",
            )}
          >
            {t(`language.${code}`)}
          </button>
        );
      })}
    </div>
  );
}
