"use client";

/**
 * Station provenance badge — the honest, unobtrusive status pill shown on
 * station cards, the detail panel and map popups.
 *
 * Labels are derived from the ACTUAL database fields (`verification_status`
 * and `data_source`) — nothing is hard-coded per station:
 *
 *   verified              → "Verified" (emerald)
 *   pending               → "Awaiting Verification" (amber)
 *   rejected              → "Rejected" (red)
 *   unverified + seed     → "Unverified Demo Data" (gray)
 *   unverified + other    → "Unverified" (gray)
 *
 * Seed/demo rows are never presented as verified real-world listings, but the
 * app still looks complete — the badge is informative, not alarming.
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
  type StationDataSource,
  type StationVerificationStatus,
} from "@/types/station";

interface StationProvenanceBadgeProps {
  verificationStatus: StationVerificationStatus;
  dataSource?: StationDataSource | null;
  /** Smaller variant for list rows / map popups. */
  compact?: boolean;
  className?: string;
}

function badgeContent(
  verificationStatus: StationVerificationStatus,
  dataSource?: StationDataSource | null,
): { label: string; className: string; title: string; Icon: typeof Database } {
  switch (verificationStatus) {
    case "verified":
      return {
        label: "Verified",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        title: "This listing has been independently verified.",
        Icon: BadgeCheck,
      };
    case "pending":
      return {
        label: "Awaiting Verification",
        className: "border-amber-200 bg-amber-50 text-amber-700",
        title: "This listing is awaiting verification.",
        Icon: Clock3,
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "border-red-200 bg-red-50 text-red-700",
        title: "This listing could not be verified.",
        Icon: XCircle,
      };
    case "unverified":
    default:
      if (dataSource === "seed") {
        return {
          label: "Unverified Demo Data",
          className: "border-gray-200 bg-gray-50 text-gray-500",
          title:
            "Demo/seed entry for testing — not an independently verified listing.",
          Icon: Database,
        };
      }
      return {
        label: "Unverified",
        className: "border-gray-200 bg-gray-50 text-gray-500",
        title: "This listing has not been independently verified yet.",
        Icon: ShieldAlert,
      };
  }
}

export function StationProvenanceBadge({
  verificationStatus,
  dataSource,
  compact = false,
  className = "",
}: StationProvenanceBadgeProps) {
  const { label, className: tone, title, Icon } = badgeContent(
    verificationStatus,
    dataSource,
  );

  const sourceHint =
    dataSource && dataSource !== "seed"
      ? ` · ${DATA_SOURCE_LABELS[dataSource]}`
      : "";

  return (
    <span
      title={`${title}${sourceHint}`}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      } ${tone} ${className}`}
    >
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {label}
    </span>
  );
}
