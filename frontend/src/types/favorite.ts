/**
 * Favorites types mirroring the backend schemas (Phase: Favorites).
 */

export interface Favorite {
  id: string;
  user_id: string;
  station_id: string;
  created_at: string;
}

export interface FavoriteList {
  items: Favorite[];
  total: number;
}
