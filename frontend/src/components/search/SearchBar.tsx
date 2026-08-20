"use client";

/**
 * One search field for the whole product.
 *
 * The app previously had four places to type: station name, brand, city, and a
 * separate AI question box. Users had to know which one to use. This component
 * unifies them:
 *
 * - a plain term ("A.A. Rano", "NNPC") runs the normal catalogue search;
 * - a natural-language request ("cheapest petrol near me", "closest CNG
 *   station") is detected and handed to Fuel Intelligence.
 *
 * Detection is deliberately conservative and *always* visible: the input shows
 * which mode it is about to use, and the user can override with the toggle, so
 * we never silently do something they didn't ask for.
 */

import { ArrowRight, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/** Words that indicate a question rather than a name lookup. */
const NL_HINTS = [
  "cheap",
  "cheapest",
  "closest",
  "nearest",
  "near me",
  "under",
  "less than",
  "best",
  "reliable",
  "where",
  "which",
  "find me",
  "i need",
  "show me",
  "available",
];

/** True when the text reads like a question for Fuel Intelligence. */
export function looksLikeQuestion(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (q.length < 4) return false;
  if (q.endsWith("?")) return true;
  if (NL_HINTS.some((hint) => q.includes(hint))) return true;
  // Four or more words is a sentence, not a station name.
  return q.split(/\s+/).length >= 4;
}

interface SearchBarProps {
  /** Current committed catalogue search term. */
  value: string;
  /** Debounced catalogue search. */
  onSearch: (term: string) => void;
  /** Hand a natural-language question to Fuel Intelligence. */
  onAsk: (question: string) => void;
  /** Defaults to the localised "Search stations, areas or fuel..." copy. */
  placeholder?: string;
  className?: string;
  /** Recent searches, rendered as one-tap chips beneath the field. */
  recent?: Array<{ id: string; label: string; onApply: () => void }>;
  onClearRecent?: () => void;
  autoFocus?: boolean;
  /** Single-row 48 px field for the map-first mobile chrome. */
  compact?: boolean;
}

const DEBOUNCE_MS = 400;

export function SearchBar({
  value,
  onSearch,
  onAsk,
  placeholder,
  className,
  recent,
  onClearRecent,
  autoFocus = false,
  compact = false,
}: SearchBarProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const committed = useRef(value);

  // Keep in sync when the term changes elsewhere (chips, resets).
  useEffect(() => {
    setText(value);
    committed.current = value;
  }, [value]);

  const isQuestion = looksLikeQuestion(text);

  // Debounced catalogue search — but never search for a question.
  useEffect(() => {
    if (isQuestion) return;
    const id = setTimeout(() => {
      if (text !== committed.current) {
        committed.current = text;
        onSearch(text);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text, isQuestion, onSearch]);

  function submit() {
    const term = text.trim();
    if (!term) return;
    if (isQuestion) {
      onAsk(term);
      return;
    }
    committed.current = term;
    onSearch(term);
  }

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "flex h-12 items-center gap-2 rounded-lg border bg-surface shadow-e1 transition-all duration-base",
          compact ? "pl-2.5 pr-1" : "pl-3.5 pr-1.5",
          focused
            ? "border-brand-500 shadow-e2 ring-2 ring-brand-500/20"
            : "border-hairline",
        )}
      >
        {isQuestion ? (
          <Sparkles className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
        ) : (
          <Search className="h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
        )}

        <input
          type="search"
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder ?? t("search.placeholder")}
          aria-label={t("search.inputLabel")}
          aria-describedby="search-mode-hint"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[16px] text-ink-900 placeholder:text-ink-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden",
            "h-12",
          )}
        />

        {text && (
          <button
            type="button"
            onClick={() => {
              setText("");
              committed.current = "";
              onSearch("");
            }}
            aria-label={t("search.clear")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 pointer-coarse:min-h-touch pointer-coarse:min-w-touch"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          aria-label={isQuestion ? t("search.askLabel") : t("search.searchLabel")}
          className={cn(
            compact
              ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
              : "flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-body-sm font-semibold pointer-coarse:min-h-touch",
            "transition-all duration-fast active:scale-[0.97] disabled:opacity-40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
            isQuestion
              ? "bg-action text-action-fg hover:bg-action-hover"
              : "bg-ink-100 text-ink-700 hover:bg-ink-200",
          )}
        >
          {isQuestion ? (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("search.ask")}</span>
            </>
          ) : (
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <p id="search-mode-hint" className="sr-only" aria-live="polite">
        {isQuestion ? t("search.hintAsk") : t("search.hintSearch")}
      </p>

      {!compact && focused && isQuestion && (
        <p className="mt-1.5 flex items-center gap-1.5 px-1 text-caption text-brand-700">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t("search.questionNotice")}
        </p>
      )}

      {recent && recent.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-label uppercase text-ink-500">{t("search.recent")}</span>
          {recent.slice(0, 4).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onApply}
              className="inline-flex items-center rounded-pill border border-hairline bg-surface px-3 py-1 text-caption font-medium text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-700 pointer-coarse:min-h-touch"
            >
              {item.label}
            </button>
          ))}
          {onClearRecent && (
            <button
              type="button"
              onClick={onClearRecent}
              className="ml-auto rounded-md px-2 py-1 text-caption text-ink-500 transition-colors hover:text-danger-strong"
            >
              {t("search.clearRecent")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
