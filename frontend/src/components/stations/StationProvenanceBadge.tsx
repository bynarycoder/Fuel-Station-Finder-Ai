"use client";

/**
 * Station provenance and verification badges.
 *
 * Every station view uses this component so that the two independent backend
 * fields are always rendered together, but never conflated:
 *
 * - `data_source` answers where the catalogue record came from. For example,
 *   `seed` is "Demo Data" and `imported` is "Imported".
 * - `verification_status` answers whether this app has independently checked
 *   the record. An imported OpenStreetMap record can therefore be honestly
 *   shown as "Imported" + "Unverified".
 *
 * The labels come from the shared maps in `types/station.ts`; no station name,
 * source id, or demo-only assumption controls the result.
 *
 * Design note: trust is a product feature, so these read as calm metadata
 * rather than alarms — verified is the only one that earns brand colour. Each
 * pill carries an icon AND text, so status is never colour-only, and the
 * explanatory copy is exposed to assistive tech via `aria-description` in
 * addition to the hover `title`.
 */

import {
  BadgeCheck,
  Clock3,
  Database,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DATA_SOURCE_LABELS,
  VERIFICATION_STATUS_LABELS,
  type StationDataSource,
  type StationVerificationStatus,
} from "@/types/station";

interface StationProvenanceBadgeProps {
  /** Actual `data_source` value returned by the station API. */
  dataSource: StationDataSource;
  /** Actual `verification_status` value returned by the station API. */
  verificationStatus: StationVerificationStatus;
  /** Smaller variant for list rows / map popups. */
  compact?: boolean;
  className?: string;
}

type BadgePresentation = {
  className: string;
  description: string;
  Icon: typeof Database;
};

const DATA_SOURCE_PRESENTATION: Record<StationDataSource, BadgePresentation> = {
  seed: {
    className: "border-hairline bg-ink-50 text-ink-500",
    description: "Demo data bundled with the app, not a live station directory.",
    Icon: Database,
  },
  imported: {
    className: "border-info-border bg-info-soft text-info-strong",
    description:
      "Imported from an external station dataset, such as OpenStreetMap. Importing a station does not independently verify it.",
    Icon: Database,
  },
  official: {
    className: "border-info-border bg-info-soft text-info-strong",
    description: "Listed from an official source. Source and app verification are separate.",
    Icon: Database,
  },
  government: {
    className: "border-info-border bg-info-soft text-info-strong",
    description: "Listed from a government source. Source and app verification are separate.",
    Icon: Database,
  },
  partner: {
    className: "border-brand-200 bg-brand-50 text-brand-800",
    description: "Listed from a partner data source. Source and app verification are separate.",
    Icon: Database,
  },
  community: {
    className: "border-accent-200 bg-accent-50 text-accent-700",
    description: "Submitted by the community. Source and app verification are separate.",
    Icon: Database,
  },
  other: {
    className: "border-hairline bg-ink-50 text-ink-600",
    description: "Listed from another documented source. Source and app verification are separate.",
    Icon: Database,
  },
};

const VERIFICATION_PRESENTATION: Record<
  StationVerificationStatus,
  BadgePresentation
> = {
  verified: {
    className: "border-success-border bg-success-soft text-success-strong",
    description: "This station has been independently verified by the app.",
    Icon: BadgeCheck,
  },
  pending: {
    className: "border-warning-border bg-warning-soft text-warning-strong",
    description: "This station is awaiting independent verification by the app.",
    Icon: Clock3,
  },
  rejected: {
    className: "border-danger-border bg-danger-soft text-danger-strong",
    description: "This station could not be independently verified by the app.",
    Icon: XCircle,
  },
  unverified: {
    className: "border-hairline bg-ink-50 text-ink-500",
    description: "This station has not yet been independently verified by the app.",
    Icon: ShieldAlert,
  },
};

export function StationProvenanceBadge({
  dataSource,
  verificationStatus,
  compact = false,
  className = "",
}: StationProvenanceBadgeProps) {
  const source = DATA_SOURCE_PRESENTATION[dataSource];
  const verification = VERIFICATION_PRESENTATION[verificationStatus];
  const sourceLabel = DATA_SOURCE_LABELS[dataSource];
  const verificationLabel = VERIFICATION_STATUS_LABELS[verificationStatus];
  const SourceIcon = source.Icon;
  const VerificationIcon = verification.Icon;
  const size = compact
    ? "px-1.5 py-[2px] text-[10px]"
    : "px-2 py-[3px] text-[11px]";
  const iconSize = compact ? "h-2.5 w-2.5" : "h-3 w-3";
  const pill =
    "inline-flex items-center gap-1 rounded-pill border font-semibold leading-none";

  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-1", className)}
      data-testid="station-provenance-badge"
    >
      <span
        aria-label={`Data source: ${sourceLabel}`}
        aria-description={source.description}
        className={cn(pill, size, source.className)}
        data-testid="station-data-source"
        title={`Data source: ${sourceLabel}. ${source.description}`}
      >
        <SourceIcon className={iconSize} aria-hidden="true" />
        {sourceLabel}
      </span>
      <span
        aria-label={`Verification status: ${verificationLabel}`}
        aria-description={verification.description}
        className={cn(pill, size, verification.className)}
        data-testid="station-verification-status"
        title={`Verification status: ${verificationLabel}. ${verification.description}`}
      >
        <VerificationIcon className={iconSize} aria-hidden="true" />
        {verificationLabel}
      </span>
    </span>
  );
}
