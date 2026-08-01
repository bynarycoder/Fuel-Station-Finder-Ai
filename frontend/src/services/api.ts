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
import type { PaginatedReports } from "@/types/report";
import type { PaginatedUsers, User } from "@/types/user";
import type { AdminAnalytics } from "@/types/admin";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

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
  page_size?: number;
}

export function fetchStations(params: StationListParams) {
  return request<PaginatedStations>("/stations", { params });
}

export interface NearbyParams {
  latitude: number;
  longitude: number;
  radius_meters?: number;
  fuel_type?: string;
  limit?: number;
}

export function fetchNearbyStations(params: NearbyParams) {
  return request<NearbyStations>("/stations/nearby", { params });
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

// --------------------------------------------------------------------------- #
// Auth
// --------------------------------------------------------------------------- #
export function fetchCurrentUser() {
  return request<User>("/auth/me");
}

// --------------------------------------------------------------------------- #
// Admin
// --------------------------------------------------------------------------- #
export function fetchAdminAnalytics() {
  return request<AdminAnalytics>("/admin/analytics");
}

export function fetchAdminReports(params: ReportListParams = {}) {
  return request<PaginatedReports>("/admin/reports", { params });
}

export function setReportStatus(reportId: string, status: string) {
  return request<PaginatedReports["items"][number]>(
    `/admin/reports/${reportId}/status`,
    { method: "PATCH", body: { status } },
  );
}

export function fetchAdminUsers(params: { page?: number; page_size?: number } = {}) {
  return request<PaginatedUsers>("/admin/users", { params });
}

export function updateUser(userId: string, body: { role?: string; is_active?: boolean }) {
  return request<User>(`/admin/users/${userId}`, { method: "PATCH", body });
}
