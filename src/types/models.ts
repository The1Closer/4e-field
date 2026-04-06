export type UserRole =
  | "admin"
  | "manager"
  | "sales_manager"
  | "production_manager"
  | "social_media_coordinator"
  | "rep";

export type JsonRecord = Record<string, unknown>;

export type JobRecord = JsonRecord & {
  id: string;
  created_at?: string;
};

export type TaskRecord = JsonRecord & {
  id: string;
  status?: "open" | "completed" | string;
  title?: string;
};

export type NotificationRecord = JsonRecord & {
  id: string;
  title?: string;
  body?: string;
  message?: string;
  is_read?: boolean;
  read_at?: string | null;
  created_at?: string;
};
