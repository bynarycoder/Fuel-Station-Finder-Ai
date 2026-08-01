"use client";

/**
 * "Report Fuel Price" form (wired to the existing backend `POST /reports`).
 *
 * Requires a fuel type and a valid Naira price (> 0). Optionally captures a
 * queue length, notes and a photo. Submission is multipart/form-data, matching
 * the backend's `Form`/`UploadFile` contract. Surfaces loading, success,
 * validation-error and API/network-error states clearly.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError, submitReport, type SubmitReportInput } from "@/services/api";
import { validatePrice } from "@/lib/pricing";
import {
  FUEL_TYPE_CODES,
  FUEL_TYPE_LABELS,
  type Station,
} from "@/types/station";
import { QUEUE_LENGTH_LABELS, type QueueLength } from "@/types/report";

interface ReportPriceFormProps {
  station: Station;
  onClose: () => void;
  /** Called after the user dismisses the success screen. */
  onSuccess: () => void;
}

export function ReportPriceForm({ station, onClose, onSuccess }: ReportPriceFormProps) {
  const queryClient = useQueryClient();
  const [fuelType, setFuelType] = useState<string>(FUEL_TYPE_CODES[0]);
  const [price, setPrice] = useState("");
  const [queue, setQueue] = useState<QueueLength | "">("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: SubmitReportInput) => submitReport(vars),
    onSuccess: () => {
      // Invalidate so the station detail + community feed refetch the new price.
      queryClient.invalidateQueries({ queryKey: ["reports", "station", station.id] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceResult = validatePrice(price);
    if (!priceResult.ok) {
      setFieldError(priceResult.error);
      return;
    }
    setFieldError(null);
    mutation.mutate({
      station_id: station.id,
      fuel_type_code: fuelType,
      price_per_litre: priceResult.value,
      queue_length: queue || undefined,
      notes: notes.trim() || undefined,
      photo: photo ?? undefined,
    });
  }

  if (mutation.isSuccess) {
    return (
      <FormShell title="Report fuel price" onClose={onSuccess}>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <p className="text-sm font-semibold text-gray-900">Price reported!</p>
          <p className="max-w-xs text-xs text-gray-500">
            Thanks for helping other drivers. Your report is pending verification
            and now appears on this station.
          </p>
          <Button onClick={onSuccess}>Done</Button>
        </div>
      </FormShell>
    );
  }

  const apiError =
    mutation.error instanceof ApiError ? mutation.error.message : null;
  const isNetworkError =
    mutation.error instanceof ApiError && mutation.error.status === 0;

  return (
    <FormShell title="Report fuel price" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Reporting for
          </p>
          <p className="text-sm font-bold text-gray-900">
            {station.brand ? `${station.brand} · ` : ""}
            {station.name}
          </p>
          {station.city && <p className="text-xs text-gray-500">{station.city}</p>}
        </div>

        <Field label="Fuel type" required>
          <select
            value={fuelType}
            onChange={(e) => setFuelType(e.target.value)}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm focus:border-emerald-500 focus:outline-none"
          >
            {FUEL_TYPE_CODES.map((code) => (
              <option key={code} value={code}>
                {FUEL_TYPE_LABELS[code]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Price (₦ per litre)" required>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
              ₦
            </span>
            <input
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 650"
              className="h-10 w-full rounded-lg border border-gray-300 pl-7 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </Field>

        <Field label="Queue length (optional)">
          <select
            value={queue}
            onChange={(e) => setQueue(e.target.value as QueueLength | "")}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="">— Not sure —</option>
            {(Object.keys(QUEUE_LENGTH_LABELS) as QueueLength[]).map((q) => (
              <option key={q} value={q}>
                {QUEUE_LENGTH_LABELS[q]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="e.g. PMS available, paying by card…"
            className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </Field>

        <Field label="Photo (optional)">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 hover:border-emerald-400">
            <Upload className="h-4 w-4" />
            {photo ? photo.name : "Choose an image (JPEG/PNG/WebP)"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </Field>

        {fieldError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {fieldError}
          </p>
        )}
        {apiError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {isNetworkError
              ? "Network error — could not reach the server. Please try again."
              : apiError}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" disabled={mutation.isPending} className="flex-1">
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
              </>
            ) : (
              "Submit price report"
            )}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </FormShell>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function FormShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}
