/**
 * Favorites hook (Phase 6) — query + optimistic add/remove.
 *
 * The favorites list is fetched once per authenticated session and kept in
 * React Query; station metadata is joined client-side from the loaded station
 * catalogue, so no extra per-station requests are needed.
 *
 * Unauthenticated users get an empty, disabled state — the UI asks them to
 * sign in instead of erroring.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { addFavorite, fetchFavorites, removeFavorite } from "@/services/api";
import type { Favorite } from "@/types/favorite";

export const FAVORITES_QUERY_KEY = ["favorites"] as const;

export function useFavorites(enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: FAVORITES_QUERY_KEY,
    queryFn: fetchFavorites,
    enabled,
    staleTime: 60_000,
  });

  const favoriteIds = new Set(
    (query.data?.items ?? []).map((f) => f.station_id),
  );

  function applyLocal(updater: (ids: Set<string>) => void) {
    const current = new Set(
      queryClient.getQueryData<{ items: Favorite[] }>(FAVORITES_QUERY_KEY)?.items.map(
        (f) => f.station_id,
      ) ?? [],
    );
    updater(current);
    queryClient.setQueryData(FAVORITES_QUERY_KEY, {
      items: [...current].map((stationId, i) => ({
        id: `local-${i}-${stationId}`,
        user_id: "",
        station_id: stationId,
        created_at: new Date().toISOString(),
      })),
      total: current.size,
    });
  }

  const add = useMutation({
    mutationFn: (stationId: string) => addFavorite(stationId),
    onMutate: (stationId) => {
      applyLocal((ids) => ids.add(stationId));
      return { stationId };
    },
    onSuccess: () => {
      // Replace optimistic state with server truth.
      void queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
    },
    onError: (_err, stationId) => {
      // Roll back the optimistic add.
      applyLocal((ids) => ids.delete(stationId));
      void queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
    },
  });

  const remove = useMutation({
    mutationFn: (stationId: string) => removeFavorite(stationId),
    onMutate: (stationId) => {
      applyLocal((ids) => ids.delete(stationId));
      return { stationId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
    },
    onError: (_err, stationId) => {
      applyLocal((ids) => ids.add(stationId));
      void queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
    },
  });

  return {
    favoriteIds,
    isFavoritesReady: query.isSuccess,
    isFavoritesError: query.isError,
    addFavorite: (stationId: string) => add.mutate(stationId),
    removeFavorite: (stationId: string) => remove.mutate(stationId),
    toggleFavorite: (stationId: string) => {
      if (favoriteIds.has(stationId)) {
        remove.mutate(stationId);
      } else {
        add.mutate(stationId);
      }
    },
    isPending: add.isPending || remove.isPending,
  };
}
