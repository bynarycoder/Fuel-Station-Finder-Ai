/**
 * Client-side API layer for the Fuel Stations backend.
 *
 * A thin `fetch` wrapper that reads the backend base URL from
 * `NEXT_PUBLIC_API_URL` and throws a typed `ApiError` on non-2xx responses.
 * React Query consumes these functions.
 */

import type {
  NearbyStations,
  PaginatedStations,
} from "@/types/station";
import type { PaginatedReports } from "@/types/report";

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

type QueryValue = string | number | boolean | undefined | null;

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
  params?: object,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError(0, "Unable to reach the server. Is the backend running?");
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Request to ${path} failed (${response.status}).`,
    );
  }

  return (await response.json()) as T;
}

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
  return request<PaginatedStations>("/stations", params);
}

export interface NearbyParams {
  latitude: number;
  longitude: number;
  radius_meters?: number;
  fuel_type?: string;
  limit?: number;
}

export function fetchNearbyStations(params: NearbyParams) {
  return request<NearbyStations>("/stations/nearby", params);
}

export interface ReportListParams {
  station_id?: string;
  fuel_type?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export function fetchReports(params: ReportListParams) {
  return request<PaginatedReports>("/reports", params);
}
