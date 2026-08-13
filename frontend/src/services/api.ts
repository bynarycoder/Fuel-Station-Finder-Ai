/**
 * Client-side API layer for the Fuel Stations backend.
 *
 * A thin `fetch` wrapper that reads the backend base URL from
 * `NEXT_PUBLIC_API_URL`, injects the current auth token (when set) into the
 * Authorization header, and throws a typed `ApiError` on non-2xx responses.
 * React Query consumes these functions.
 */

import type {
  NearbyStations,
  PaginatedStations,
} from "@/types/station";
import type { FuelReport, FuelReportAdmin, PaginatedReports } from "@/types/report";
import type { FavoriteList, Favorite } from "@/types/favorite";
import type { PaginatedUsers, User } from "@/types/user";
import type { AdminAnalytics } from "@/types/admin";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://fuel-station-finder-ai.onrender.com/api/v1";

/**
 * Resolve a backend-served media path (e.g. ``/media/abc.jpg`` returned as
 * ``photo_url``) to an absolute URL on the **backend** origin.
 *
 * The backend serves uploaded photos from its own ``/media`` mount, while
 * ``NEXT_PUBLIC_API_URL`` points at the API base which ends in ``/api/v1``.
 * Naively using a relative ``/media/...`` path makes the browser request the
 * Vercel (frontend) origin, where nothing is served. Here we derive the
 * backend origin from the API URL, so:
 *
 *   https://api.onrender.com/api/v1  +  /media/abc.jpg
 *     -> https://api.onrender.com/media/abc.jpg
 *
 * Safe handling:
 * - ``null``/empty paths return ``null``;
 * - already-absolute URLs (http/https/blob/data) are returned unchanged;
 * - leading/trailing slashes are normalized;
 * - works in local development (http://localhost:8000).
 */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;

  const trimmed = path.trim();
  if (!trimmed) return null;

  // Already an absolute URL (http(s), data:, blob:, etc.).
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;

  // Derive the backend origin from the API base URL.
  let origin: string;
  try {
    const parsed = new URL(API_URL);
    origin = parsed.origin;
  } catch {
    origin = API_URL.replace(/\/api\/v\d+\/?$/, "");
  }

  // Strip any /api/v1 segment from the origin just in case the configured base
  // has no trailing path (defensive), and normalize slashes.
  const normalizedPath = "/" + trimmed.replace(/^\/+/, "");
  return `${origin.replace(/\/+$/, "")}${normalizedPath}`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Auth token injected by the auth layer; attached to every request when present.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

/**
 * Provider registered by the auth layer (``lib/auth``) that returns the
 * freshest access token from the live Supabase session. Used to re-sync the
 * in-memory bearer token after an auth rejection (e.g. the module state was
 * dropped, or Supabase rotated the access token). Injected to keep this
 * module free of Supabase imports (lib/auth already imports this module).
 */
let authTokenProvider: (() => Promise<string | null>) | null = null;
export function setAuthTokenProvider(
  provider: (() => Promise<string | null>) | null,
) {
  authTokenProvider = provider;
}

type QueryValue = string | number | boolean | undefined | null;

interface RequestOptions {
  method?: string;
  params?: object;
  body?: unknown;
}

function buildUrl(path: string, params?: object): string {
  const url = new URL(`${API_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", params, body } = options;
  const url = buildUrl(path, params);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  let payload: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, "Unable to reach the server. Is the backend running?");
  }

  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed (${response.status}).`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

// --------------------------------------------------------------------------- #
// Stations (public)
// --------------------------------------------------------------------------- #
export interface StationListParams {
  q?: string;
  brand?: string;
  city?: string;
  state?: string;
  fuel_type?: string;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

export function fetchStations(params: StationListParams) {
  return request<PaginatedStations>("/stations", { params });
}

/** Largest page the backend accepts (matches `station_service.MAX_PAGE_SIZE`). */
export const STATIONS_PAGE_SIZE = 100;

/**
 * Fetch *every* station the catalogue endpoint returns for the given filters.
 *
 * The backend paginates (`page_size` is capped at 100) and reports a `total`;
 * the browse view needs the whole catalogue, so we walk every page until we
 * hold `total` items and merge them into a single `PaginatedStations`-shaped
 * result (the same shape `fetchStations` returns for one page).
 *
 * Items are deduplicated by `id` so a row inserted between page requests can
 * never surface twice; deterministic ordering (`name ASC, id ASC`) otherwise
 * keeps page boundaries clean.
 */
export async function fetchAllStations(
  params: StationListParams = {},
): Promise<PaginatedStations> {
  const pageSize = STATIONS_PAGE_SIZE;
  const first = await fetchStations({ ...params, page: 1, page_size: pageSize });

  const byId = new Map<string, PaginatedStations["items"][number]>();
  for (const station of first.items) byId.set(station.id, station);

  const totalPages = Math.ceil(first.total / pageSize);
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await fetchStations({ ...params, page, page_size: pageSize });
    for (const station of next.items) byId.set(station.id, station);
  }

  return {
    items: [...byId.values()],
    total: first.total,
    page: 1,
    page_size: pageSize,
  };
}

export interface NearbyParams {
  latitude: number;
  longitude: number;
  radius_meters?: number;
  fuel_type?: string;
  limit?: number;
}

/**
 * Nearby search — GET /stations/nearby?latitude=…&longitude=…&radius_meters=…
 *
 * The backend (FastAPI + PostGIS) computes `distance_meters` via ST_Distance
 * and returns items sorted nearest-first. Development-only diagnostics log the
 * request and response so the location lifecycle can be traced end-to-end;
 * nothing is logged in production builds.
 */
export function fetchNearbyStations(params: NearbyParams) {
  if (process.env.NODE_ENV !== "production") {
    console.info("[geo] nearby request", {
      latitude: params.latitude.toFixed(4),
      longitude: params.longitude.toFixed(4),
      radius_meters: params.radius_meters,
      fuel_type: params.fuel_type,
    });
  }
  return request<NearbyStations>("/stations/nearby", { params }).then((result) => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[geo] nearby response", {
        count: result.items.length,
        nearest: result.items[0]?.distance_meters ?? null,
      });
    }
    return result;
  });
}

// --------------------------------------------------------------------------- #
// Reports (public feed)
// --------------------------------------------------------------------------- #
export interface ReportListParams {
  station_id?: string;
  fuel_type?: string;
  status?: string;
  page_size?: number;
}

export function fetchReports(params: ReportListParams) {
  return request<PaginatedReports>("/reports", { params });
}

/** Latest reports for a single station (for the station detail view). */
export function fetchStationReports(stationId: string) {
  return request<PaginatedReports>("/reports", {
    params: { station_id: stationId, page_size: 20 },
  });
}

/**
 * The signed-in user's own reports — every status, including rejected (which
 * the public feed hides) plus the reviewer's rejection reason.
 */
export function fetchMyReports(params: ReportListParams = {}) {
  return request<PaginatedReports>("/reports/mine", { params });
}

export interface SubmitReportInput {
  station_id: string;
  fuel_type_code: string;
  price_per_litre?: number;
  queue_length?: string;
  notes?: string;
  photo?: File;
}

/**
 * Submit a fuel report as multipart/form-data (the backend expects Form fields
 * + an optional photo `UploadFile`). Does NOT set Content-Type so the browser
 * can attach the multipart boundary. Throws `ApiError` on failure.
 */
export async function submitReport(input: SubmitReportInput): Promise<FuelReport> {
  const form = new FormData();
  form.set("station_id", input.station_id);
  form.set("fuel_type_code", input.fuel_type_code);
  if (input.price_per_litre != null) {
    form.set("price_per_litre", String(input.price_per_litre));
  }
  if (input.queue_length) {
    form.set("queue_length", input.queue_length);
  }
  if (input.notes) {
    form.set("notes", input.notes);
  }
  if (input.photo) {
    form.append("photo", input.photo);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}/reports`, {
      method: "POST",
      headers,
      body: form,
    });
  } catch {
    throw new ApiError(0, "Unable to reach the server. Is the backend running?");
  }

  if (response.status === 401) {
    throw new ApiError(401, "You must be signed in to report a price.");
  }
  if (!response.ok) {
    throw new ApiError(response.status, `Report submission failed (${response.status}).`);
  }
  return (await response.json()) as FuelReport;
}

// --------------------------------------------------------------------------- #
// Auth
// --------------------------------------------------------------------------- #
/**
 * Fetch the caller's application profile (this call also JIT-provisions the
 * local user row on first sight). If the backend rejects the bearer token,
 * re-sync it once from the live Supabase session and retry — recovering from
 * expired or lost in-memory tokens. This never weakens authentication: only
 * tokens issued to a real Supabase session are attached, and a genuinely
 * invalid session still fails with the backend's original error.
 */
export async function fetchCurrentUser(): Promise<User> {
  try {
    return await request<User>("/auth/me");
  } catch (err) {
    const isAuthRejection =
      err instanceof ApiError && (err.status === 401 || err.status === 403);
    if (!isAuthRejection || !authTokenProvider) {
      console.warn("[auth] /auth/me request failed:", err);
      throw err;
    }

    const fresh = await authTokenProvider();
    if (!fresh || fresh === authToken) {
      console.warn("[auth] /auth/me request failed:", err);
      throw err;
    }

    setAuthToken(fresh);
    try {
      return await request<User>("/auth/me");
    } catch (retryErr) {
      console.warn("[auth] /auth/me failed after token re-sync:", retryErr);
      throw retryErr;
    }
  }
}

// --------------------------------------------------------------------------- #
// Favorites (authenticated, user-scoped)
// --------------------------------------------------------------------------- #
export function fetchFavorites() {
  return request<FavoriteList>("/favorites");
}

/** Add a station to favorites. Idempotent server-side. */
export function addFavorite(stationId: string) {
  return request<Favorite>(`/favorites/${stationId}`, { method: "PUT" });
}

/** Remove a station from favorites. Idempotent server-side. */
export function removeFavorite(stationId: string) {
  return request<void>(`/favorites/${stationId}`, { method: "DELETE" });
}

// --------------------------------------------------------------------------- #
// AI verification (admin-only; backend enforces the Admin role)
// --------------------------------------------------------------------------- #
export interface VerificationResult {
  score: number;
  is_plausible: boolean;
  summary: string;
  detected_attributes: string[];
  report_status: string;
}

/** Run Gemini photo verification on a report. Backend rejects non-admins. */
export function verifyReport(reportId: string) {
  return request<VerificationResult>(`/reports/${reportId}/verify`, {
    method: "POST",
  });
}

// --------------------------------------------------------------------------- #
// Admin
// --------------------------------------------------------------------------- #
export function fetchAdminAnalytics() {
  return request<AdminAnalytics>("/admin/analytics");
}

export function fetchAdminReports(params: ReportListParams = {}) {
  return request<PaginatedReports<FuelReportAdmin>>("/admin/reports", { params });
}

export function setReportStatus(
  reportId: string,
  status: string,
  options: { rejection_reason?: string; reviewer_notes?: string } = {},
) {
  return request<FuelReportAdmin>(
    `/admin/reports/${reportId}/status`,
    { method: "PATCH", body: { status, ...options } },
  );
}

export function fetchAdminUsers(params: { page?: number; page_size?: number } = {}) {
  return request<PaginatedUsers>("/admin/users", { params });
}

export function updateUser(userId: string, body: { role?: string; is_active?: boolean }) {
  return request<User>(`/admin/users/${userId}`, { method: "PATCH", body });
}
