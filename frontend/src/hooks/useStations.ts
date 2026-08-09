/**
 * React Query hooks for stations.
 *
 * Exposes a single `useStationsQuery` that switches between the catalogue
 * (browse) and the spatial "near me" endpoint based on the Zustand map store.
 * Items are normalised so the UI can render both shapes uniformly (distance is
 * only present in nearby mode).
 *
 * Nearby mode guarantees:
 * - every item carries a numeric `distance_meters` (server value, or a
 *   Haversine fallback computed client-side)
 * - items are sorted nearest → farthest (server already sorts; we re-sort
 *   defensively so the list, map and "Closest to you" card never depend on
 *   API ordering)
 *
 * API throttling: the query key changes only when the user moves a meaningful
 * distance (≥75 m — enforced in StationFilters), the radius changes, or the
 * fuel filter changes, so tiny GPS jitter never retriggers the nearby call.
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { geoLog } from "@/lib/geo";
import { haversineDistance } from "@/lib/format";
import { fetchNearbyStations, fetchStations } from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import type { Station } from "@/types/station";

export type StationItem = Station & { distance_meters?: number };

/** Sort by distance (server value, else Haversine from the user's position). */
function sortNearbyItems(
  items: StationItem[],
  user: { latitude: number; longitude: number } | null,
): StationItem[] {
  return [...items].sort((a, b) => {
    const da =
      typeof a.distance_meters === "number"
        ? a.distance_meters
        : user
          ? haversineDistance(user, a)
          : Number.MAX_SAFE_INTEGER;
    const db =
      typeof b.distance_meters === "number"
        ? b.distance_meters
        : user
          ? haversineDistance(user, b)
          : Number.MAX_SAFE_INTEGER;
    return da - db;
  });
}

export function useStationsQuery(favoriteIds?: Set<string>) {
  const mode = useMapStore((s) => s.mode);
  const filters = useMapStore((s) => s.filters);
  const userLocation = useMapStore((s) => s.userLocation);
  const radiusMeters = useMapStore((s) => s.radiusMeters);
  const favoritesOnly = useMapStore((s) => s.favoritesOnly);

  const nearbyEnabled = mode === "nearby" && userLocation !== null;

  const nearby = useQuery({
    queryKey: ["stations", "nearby", userLocation, radiusMeters, filters.fuelType],
    queryFn: () => {
      geoLog("nearby: request", {
        latitude: userLocation!.latitude.toFixed(4),
        longitude: userLocation!.longitude.toFixed(4),
        radius_meters: radiusMeters,
        fuel_type: filters.fuelType || undefined,
      });
      return fetchNearbyStations({
        latitude: userLocation!.latitude,
        longitude: userLocation!.longitude,
        radius_meters: radiusMeters,
        fuel_type: filters.fuelType || undefined,
        limit: 100,
      }).then((result) => {
        geoLog("nearby: response", { count: result.items.length });
        return result;
      });
    },
    enabled: nearbyEnabled,
    placeholderData: keepPreviousData,
  });

  const browse = useQuery({
    queryKey: ["stations", "browse", filters],
    queryFn: () =>
      fetchStations({
        q: filters.q || undefined,
        brand: filters.brand || undefined,
        city: filters.city || undefined,
        fuel_type: filters.fuelType || undefined,
        is_active: true,
        page_size: 100,
      }),
    enabled: !nearbyEnabled,
    placeholderData: keepPreviousData,
  });

  const active = nearbyEnabled ? nearby : browse;

  const rawItems: StationItem[] = active.data
    ? nearbyEnabled
      ? (active.data as Awaited<ReturnType<typeof fetchNearbyStations>>).items
      : (active.data as Awaited<ReturnType<typeof fetchStations>>).items
    : [];

  // Nearby mode: sort nearest → farthest; fall back to Haversine when the
  // backend did not attach a distance so every item still has one.
  let items: StationItem[] = nearbyEnabled
    ? sortNearbyItems(rawItems, userLocation).map((item) =>
        typeof item.distance_meters === "number" || !userLocation
          ? item
          : { ...item, distance_meters: haversineDistance(userLocation, item) },
      )
    : rawItems;

  // "My Favorites" filter — applied client-side from the user's favorite ids
  // so it composes with browse/nearby/fuel filters without extra API calls.
  if (favoritesOnly && favoriteIds && favoriteIds.size > 0) {
    items = items.filter((s) => favoriteIds.has(s.id));
  }

  return {
    items,
    isLoading: active.isLoading,
    isFetching: active.isFetching,
    isError: active.isError,
    error: active.error,
    refetch: active.refetch,
    isNearby: nearbyEnabled,
  };
}
