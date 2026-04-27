import type { UserRole } from "@/types/models";

export function isValidRole(value: unknown): value is UserRole {
  return (
    value === "admin" ||
    value === "manager" ||
    value === "sales_manager" ||
    value === "production_manager" ||
    value === "social_media_coordinator" ||
    value === "rep"
  );
}

export function isManagerLike(role: string | null | undefined) {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "sales_manager" ||
    role === "production_manager" ||
    role === "social_media_coordinator"
  );
}
