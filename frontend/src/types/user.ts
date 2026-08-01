/** User profile types (mirrors the backend UserPublic + admin listing). */

export type UserRole = "driver" | "station_manager" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaginatedUsers {
  items: User[];
  total: number;
  page: number;
  page_size: number;
}
