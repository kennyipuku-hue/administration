import type { UserRole } from "@/types";

export function canManage(role: UserRole | undefined): boolean {
  return role === "super_admin" || role === "admin";
}

export function isSuperAdmin(role: UserRole | undefined): boolean {
  return role === "super_admin";
}

export function fullName(first: string, surname: string): string {
  return `${first} ${surname}`.trim();
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date + (date.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generatePatientNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `PT-${year}-${rand}`;
}

export function generateEmployeeNumber(): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EMP-${rand}`;
}
