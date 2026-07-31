/**
 * React Query hooks for stations.
 *
 * Exposes a single `useStationsQuery` that switches between the catalogue
 * (browse) and the spatial "near me" endpoint based on the Zustand map store.
 * Items are normalised so the UI can render both shapes uniformly (distance is
 * only present in nearby mode).
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { fetchNearbyStations, fetchStations } from "@/services/api";
import { useMapStore } from "@/store/useMapStore";
import type { Station } from "@/types/station";

export type StationItem = Station & { distance_meters?: number };

export function useStationsQuery() {
  const mode = useMapStore((s) => s.mode);
  const filters = useMapStore((s) => s.filters);
  const userLocation = useMapStore((s) => s.userLocation);
  const radiusMeters = useMapStore((s) => s.radiusMeters);

  const nearbyEnabled = mode === "nearby" && userLocation !== null;

  const nearby = useQuery({
    queryKey: ["stations", "nearby", userLocation, radiusMeters, filters.fuelType],
    queryFn: () =>
      fetchNearbyStations({
        latitude: userLocation!.latitude,
        longitude: userLocation!.longitude,
        radius_meters: radiusMeters,
        fuel_type: filters.fuelType || undefined,
        limit: 100,
      }),
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

  const items: StationItem[] = active.data
    ? nearbyEnabled
      ? (active.data as Awaited<ReturnType<typeof fetchNearbyStations>>).items
      : (active.data as Awaited<ReturnType<typeof fetchStations>>).items
    : [];

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
