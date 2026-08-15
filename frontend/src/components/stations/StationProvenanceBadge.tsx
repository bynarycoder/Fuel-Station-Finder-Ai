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
 */

import {
  BadgeCheck,
  Clock3,
  Database,
  ShieldAlert,
  XCircle,
} from "lucide-react";

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
    className: "border-gray-200 bg-gray-50 text-gray-600",
    description: "Demo data bundled with the app, not a live station directory.",
    Icon: Database,
  },
  imported: {
    className: "border-sky-200 bg-sky-50 text-sky-700",
    description:
      "Imported from an external station dataset, such as OpenStreetMap. Importing a station does not independently verify it.",
    Icon: Database,
  },
  official: {
    className: "border-indigo-200 bg-indigo-50 text-indigo-700",
    description: "Listed from an official source. Source and app verification are separate.",
    Icon: Database,
  },
  government: {
    className: "border-blue-200 bg-blue-50 text-blue-700",
    description: "Listed from a government source. Source and app verification are separate.",
    Icon: Database,
  },
  partner: {
    className: "border-violet-200 bg-violet-50 text-violet-700",
    description: "Listed from a partner data source. Source and app verification are separate.",
    Icon: Database,
  },
  community: {
    className: "border-orange-200 bg-orange-50 text-orange-700",
    description: "Submitted by the community. Source and app verification are separate.",
    Icon: Database,
  },
  other: {
    className: "border-slate-200 bg-slate-50 text-slate-700",
    description: "Listed from another documented source. Source and app verification are separate.",
    Icon: Database,
  },
};

const VERIFICATION_PRESENTATION: Record<
  StationVerificationStatus,
  BadgePresentation
> = {
  verified: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    description: "This station has been independently verified by the app.",
    Icon: BadgeCheck,
  },
  pending: {
    className: "border-amber-200 bg-amber-50 text-amber-700",
    description: "This station is awaiting independent verification by the app.",
    Icon: Clock3,
  },
  rejected: {
    className: "border-red-200 bg-red-50 text-red-700",
    description: "This station could not be independently verified by the app.",
    Icon: XCircle,
  },
  unverified: {
    className: "border-gray-200 bg-gray-50 text-gray-500",
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
  const size = compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  const iconSize = compact ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 ${className}`}
      data-testid="station-provenance-badge"
    >
      <span
        aria-label={`Data source: ${sourceLabel}`}
        className={`inline-flex items-center gap-1 rounded-full border font-semibold ${size} ${source.className}`}
        data-testid="station-data-source"
        title={`Data source: ${sourceLabel}. ${source.description}`}
      >
        <SourceIcon className={iconSize} />
        {sourceLabel}
      </span>
      <span
        aria-label={`Verification status: ${verificationLabel}`}
        className={`inline-flex items-center gap-1 rounded-full border font-semibold ${size} ${verification.className}`}
        data-testid="station-verification-status"
        title={`Verification status: ${verificationLabel}. ${verification.description}`}
      >
        <VerificationIcon className={iconSize} />
        {verificationLabel}
      </span>
    </span>
  );
}
