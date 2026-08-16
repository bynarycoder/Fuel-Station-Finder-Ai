"use client";

/**
 * "Report fuel price" — a three-step flow instead of one long form.
 *
 * Steps: 1 Fuel & price · 2 Conditions · 3 Evidence & submit.
 * Progress is always visible, each step holds two decisions at most, and the
 * primary action is the only full-width button on screen.
 *
 * The API contract is UNCHANGED: one multipart `POST /reports` with
 * station_id, fuel_type_code, price_per_litre, optional queue_length, notes
 * and photo — exactly what the backend's Form/UploadFile handler expects.
 *
 * SUBMISSION STATE MACHINE (regression-guarded by ReportPriceForm.test.tsx).
 * A report used to be submittable by things that are not the Submit button:
 * the browser's *implicit submission* (Enter in the price field, or Enter
 * while the hidden file input had focus) fired the form's submit handler, so a
 * report could be sent — with no photo attached — while the user was still
 * choosing one. The fix, in order of importance:
 *
 *   1. The <form> never submits. `onSubmit` only calls preventDefault(); it
 *      NEVER creates a report. Implicit submission is therefore inert.
 *   2. The only path to `POST /reports` is tapping "Submit price report"
 *      (an explicit type="button" handler).
 *   3. Selecting a photo only moves it to a PENDING state. The file is
 *      uploaded as part of that one multipart submit — never before it, and
 *      never as a side effect of opening the picker.
 *   4. Cancelling the picker (an onChange with an empty FileList in some
 *      browsers) changes nothing: no submit, no cleared fields, no success.
 *   5. Success is shown ONLY after the backend confirms with a persisted
 *      report id. An upload/validation/network failure keeps the form (and the
 *      selected photo) intact so the user can retry.
 *
 * Smart defaults: the fuel selector is seeded from the fuels this station
 * actually lists (falling back to the canonical codes), so most users only
 * type a price.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogHeader } from "@/components/ui/Sheet";
import { ApiError, submitReport, type SubmitReportInput } from "@/services/api";
import { validatePrice } from "@/lib/pricing";
import { ACCEPT_ATTRIBUTE, validatePhotoFile } from "@/lib/upload";
import { stationLabel } from "@/lib/stationName";
import { cn } from "@/lib/utils";
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

const STEPS = ["Fuel & price", "Conditions", "Evidence"] as const;

export function ReportPriceForm({ station, onClose, onSuccess }: ReportPriceFormProps) {
  const queryClient = useQueryClient();

  // Smart default: the first fuel this station actually lists.
  const stationFuels = station.fuel_types
    .map((f) => f.code)
    .filter((code) => (FUEL_TYPE_CODES as readonly string[]).includes(code));
  const fuelOptions = stationFuels.length > 0 ? stationFuels : [...FUEL_TYPE_CODES];

  const [step, setStep] = useState(0);
  const [fuelType, setFuelType] = useState<string>(fuelOptions[0]);
  const [price, setPrice] = useState("");
  const [queue, setQueue] = useState<QueueLength | "">("");
  const [notes, setNotes] = useState("");
  // Photo states are deliberately separate from submission states: a selected
  // photo is PENDING until the user submits, and a rejected file never becomes
  // a selection.
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  /**
   * Object URL for the staged photo's preview thumbnail.
   *
   * Derived state ONLY — it is created from, and revoked with, `photo`, and
   * has no influence on validation or submission. Revoking on change/unmount
   * matters because an un-revoked object URL pins the whole image in memory,
   * which on a phone with a 5 MB photo is a real leak.
   *
   * `createObjectURL` is feature-detected so the form still renders in jsdom.
   */
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo || typeof URL?.createObjectURL !== "function") {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreviewUrl(url);
    return () => {
      URL.revokeObjectURL?.(url);
    };
  }, [photo]);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  // Guards a second submit slipping through before React re-renders the
  // disabled button (double-tap / double Enter).
  const submittingRef = useRef(false);

  const mutation = useMutation({
    mutationFn: (vars: SubmitReportInput) => submitReport(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", "station", station.id] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  function goNext() {
    if (step === 0) {
      const result = validatePrice(price);
      if (!result.ok) {
        setFieldError(result.error);
        return;
      }
      setFieldError(null);
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  /**
   * The form element never submits a report. Implicit submission (Enter in a
   * field, Enter on the focused file input, a stray label activation) lands
   * here and is swallowed, so choosing a photo can never create a report.
   */
  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
  }

  /** File chosen (or picker cancelled) — this NEVER submits the report. */
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const selected = input.files?.[0] ?? null;

    // Cancelled picker: some browsers fire change with an empty FileList.
    // Keep the current state exactly as it was — no submit, no clearing.
    if (!selected) {
      input.value = "";
      return;
    }

    const result = validatePhotoFile(selected);
    // Reset the input so re-picking the SAME file fires change again.
    input.value = "";

    if (!result.ok) {
      setPhoto(null);
      setPhotoError(result.error);
      return;
    }
    setPhotoError(null);
    setPhoto(result.file);
  }

  function removePhoto() {
    setPhoto(null);
    setPhotoError(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  /**
   * The ONLY path that creates a report. Validates first, then sends one
   * multipart request (fields + photo). Success is rendered only after the
   * backend confirms.
   */
  function handleSubmitClick() {
    if (submittingRef.current || mutation.isPending) return;

    const priceResult = validatePrice(price);
    if (!priceResult.ok) {
      setFieldError(priceResult.error);
      setStep(0);
      return;
    }
    if (photoError) {
      // An invalid file must be resolved (or removed) before submitting.
      return;
    }
    setFieldError(null);
    submittingRef.current = true;
    mutation.mutate({
      station_id: station.id,
      fuel_type_code: fuelType,
      price_per_litre: priceResult.value,
      queue_length: queue || undefined,
      notes: notes.trim() || undefined,
      photo: photo ?? undefined,
    });
  }

  /* ------------------------------------------------------------- success --
   * Only a backend-confirmed report (a persisted id came back) shows success.
   * Neither selecting a photo nor an in-flight request can reach this screen.
   */
  if (mutation.isSuccess && mutation.data?.id) {
    return (
      <>
        <DialogHeader
          title="Report submitted"
          titleId="report-form-title"
          onClose={onSuccess}
        />
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-pill bg-success-soft text-success-strong">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-h2 text-ink-900">Thank you for helping other drivers</p>
          <p className="max-w-xs text-body-sm text-ink-600">
            Your report is being reviewed and already appears on this station.
          </p>
          <Button className="mt-2" onClick={onSuccess}>
            Done
          </Button>
        </div>
      </>
    );
  }

  const apiError = mutation.error instanceof ApiError ? mutation.error.message : null;
  const isNetworkError =
    mutation.error instanceof ApiError && mutation.error.status === 0;

  return (
    <>
      <DialogHeader
        title="Report fuel price"
        titleId="report-form-title"
        subtitle={stationLabel(station.brand, station.name)}
        onClose={onClose}
      />

      {/* Progress */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-hairline bg-surface px-4 py-3">
        {STEPS.map((name, i) => (
          <div key={name} className="flex flex-1 flex-col gap-1.5">
            <span
              className={cn(
                "h-1 rounded-pill transition-colors duration-base",
                i <= step ? "bg-action" : "bg-ink-200",
              )}
            />
            <span
              className={cn(
                "text-[11px] font-semibold",
                i === step ? "text-brand-700" : "text-ink-500",
              )}
            >
              {i < step ? (
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  {name}
                </span>
              ) : (
                name
              )}
            </span>
          </div>
        ))}
      </div>

      <form onSubmit={handleFormSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <p className="sr-only" aria-live="polite">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>

          {/* ------------------------------------------ step 1: fuel+price */}
          {step === 0 && (
            <div className="space-y-5 animate-fade-in">
              <Field label="Which fuel did you buy?" required>
                <div className="flex flex-wrap gap-1.5">
                  {fuelOptions.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setFuelType(code)}
                      aria-pressed={fuelType === code}
                      className={cn(
                        "inline-flex h-11 items-center rounded-lg border px-3.5 text-body-sm font-semibold transition-colors",
                        fuelType === code
                          ? "border-action bg-action text-action-fg"
                          : "border-hairline bg-surface text-ink-700 hover:border-brand-300",
                      )}
                    >
                      {FUEL_TYPE_LABELS[code as keyof typeof FUEL_TYPE_LABELS] ?? code}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Price per litre" required hint="What you actually paid today.">
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-h2 text-ink-500"
                    aria-hidden="true"
                  >
                    ₦
                  </span>
                  <input
                    inputMode="decimal"
                    value={price}
                    autoFocus
                    data-autofocus=""
                    onChange={(e) => setPrice(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter advances the wizard. It must never submit the
                      // report: the form's submit handler is inert by design.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        goNext();
                      }
                    }}
                    placeholder="850"
                    aria-label="Price in naira per litre"
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={fieldError ? "report-field-error" : undefined}
                    className="h-14 w-full rounded-lg border border-hairline bg-surface pl-9 pr-3 text-h1 tabular-nums text-ink-900 placeholder:font-normal placeholder:text-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </Field>
            </div>
          )}

          {/* ------------------------------------------- step 2: conditions */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              <Field label="How long was the queue?" hint="Optional — skip if unsure.">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(QUEUE_LENGTH_LABELS) as QueueLength[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQueue(queue === q ? "" : q)}
                      aria-pressed={queue === q}
                      className={cn(
                        "flex h-12 items-center justify-center rounded-lg border px-3 text-body-sm font-semibold transition-colors",
                        queue === q
                          ? "border-action bg-action text-action-fg"
                          : "border-hairline bg-surface text-ink-700 hover:border-brand-300",
                      )}
                    >
                      {QUEUE_LENGTH_LABELS[q]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Anything else drivers should know?" hint="Optional.">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="e.g. PMS available, card payment working"
                  className="w-full rounded-lg border border-hairline bg-surface p-3 text-body-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 pointer-coarse:text-[16px]"
                />
              </Field>
            </div>
          )}

          {/* --------------------------------------------- step 3: evidence */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <Field
                label="Photo (Optional)"
                hint="Add a clear photo of the price board — photos get verified faster."
              >
                {/* Reference layout: staged preview on the LEFT, the dashed
                    browse target on the RIGHT. With no photo yet the target
                    takes the full width, so the first-run state is not a
                    half-empty row. */}
                <div className="flex items-stretch gap-3">
                  {photo && (
                    <div
                      className="relative h-32 w-32 shrink-0 overflow-hidden rounded-xl border border-hairline bg-ink-100"
                      data-testid="photo-preview"
                    >
                      {photoPreviewUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoPreviewUrl}
                          alt={`Selected photo: ${photo.name}`}
                          className="h-full w-full object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={removePhoto}
                        aria-label={`Remove photo ${photo.name}`}
                        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-pill bg-ink-900/70 text-white transition-colors hover:bg-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  <label
                    className={cn(
                      "flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-6 text-center transition-colors",
                      photo
                        ? "border-brand-400 bg-brand-50"
                        : "border-ink-200 bg-ink-50 hover:border-brand-300",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-pill",
                        photo ? "bg-action text-action-fg" : "bg-surface text-ink-500",
                      )}
                    >
                      {photo ? (
                        <Check className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Camera className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>
                    {/* A visible, button-shaped affordance: on a phone the label
                        IS the picker trigger, so it must look tappable. It stays
                        a <span> — a nested <button> would swallow the click and
                        never open the file picker. */}
                    <span className="inline-flex min-h-touch items-center rounded-lg border border-brand-300 bg-surface px-4 text-body-sm font-semibold text-brand-800 shadow-e1">
                      {photo ? "Choose a different photo" : "Browse photos"}
                    </span>
                    <span className="text-caption text-ink-500">
                      JPEG, PNG or WebP · up to 5 MB
                    </span>
                    {/* Selecting a file ONLY stages it. The upload happens with
                        the report when the user taps Submit. */}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept={ACCEPT_ATTRIBUTE}
                      className="sr-only"
                      aria-label="Take or choose a photo"
                      aria-invalid={photoError ? true : undefined}
                      aria-describedby={photoError ? "report-photo-error" : undefined}
                      data-testid="report-photo-input"
                      onChange={handlePhotoChange}
                    />
                  </label>
                </div>

                {photo && (
                  <div
                    className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-hairline bg-surface px-3 py-2"
                    data-testid="photo-pending"
                  >
                    <p className="min-w-0 text-caption text-ink-600">
                      <span className="font-semibold text-ink-800">Selected:</span>{" "}
                      <span className="break-all">{photo.name}</span> — uploads when
                      you submit this report.
                    </p>
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      aria-label={`Replace photo ${photo.name}`}
                      className="flex min-h-touch shrink-0 items-center gap-1 rounded-md px-2 text-caption font-semibold text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Replace
                    </button>
                  </div>
                )}

                {photoError && (
                  <p
                    role="alert"
                    id="report-photo-error"
                    data-testid="photo-error"
                    className="mt-2 flex items-start gap-1.5 rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-caption font-medium text-danger-strong"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {photoError}
                  </p>
                )}
              </Field>

              {/* Review summary */}
              <div className="rounded-xl border border-hairline bg-ink-50 p-3.5">
                <p className="text-label uppercase text-ink-500">You&apos;re reporting</p>
                <p className="mt-1.5 text-h2 text-ink-900">
                  ₦{price || "—"}
                  <span className="ml-1 text-body-sm font-semibold text-ink-500">
                    /L · {fuelType}
                  </span>
                </p>
                <p className="mt-1 text-caption text-ink-600">
                  {stationLabel(station.brand, station.name)}
                  {queue ? ` · ${QUEUE_LENGTH_LABELS[queue]}` : ""}
                </p>
              </div>
            </div>
          )}

          {/* Errors */}
          {fieldError && (
            <p
              role="alert"
              id="report-field-error"
              className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2.5 text-body-sm font-medium text-danger-strong"
            >
              {fieldError}
            </p>
          )}
          {apiError && (
            <p
              role="alert"
              className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2.5 text-body-sm font-medium text-danger-strong"
            >
              {isNetworkError
                ? "We couldn't reach the server. Check your connection and try again."
                : apiError}
            </p>
          )}

          <p className="flex items-start gap-1.5 text-caption text-ink-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
            Your report helps other drivers find fuel faster. Reports are reviewed
            before they are marked verified.
          </p>
        </div>

        {/* Footer actions */}
        <div className="flex shrink-0 items-center gap-2 border-t border-hairline bg-surface p-4 pb-safe">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}

          {step < STEPS.length - 1 ? (
            <Button className="flex-1" onClick={goNext} disabled={step === 0 && !price.trim()}>
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              className="flex-1"
              onClick={handleSubmitClick}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                "Submit price report"
              )}
            </Button>
          )}
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-body-sm font-semibold text-ink-800">
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </p>
      {children}
      {hint && <p className="mt-1.5 text-caption text-ink-500">{hint}</p>}
    </div>
  );
}
