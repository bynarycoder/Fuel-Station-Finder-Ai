/** Admin analytics types (mirrors the backend AnalyticsSummary). */

export interface AdminAnalytics {
  stations: { total: number; active: number };
  reports: {
    total: number;
    by_status: Record<string, number>;
  };
  users: {
    total: number;
    by_role: Record<string, number>;
  };
}
