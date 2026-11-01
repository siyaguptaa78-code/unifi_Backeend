import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const APP_TIMEZONE = "Asia/Kolkata";

export function formatINR(amount: number | undefined | null) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount ?? 0);
}

export function formatNumber(n: number | undefined | null) {
  return new Intl.NumberFormat("en-IN").format(n ?? 0);
}

export function formatPoints(n: number | undefined | null) {
  return `${formatNumber(n)} pts`;
}

export function formatDateTime(d: string | Date | undefined | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: APP_TIMEZONE }).format(new Date(d));
}

export function formatDate(d: string | Date | undefined | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: APP_TIMEZONE }).format(new Date(d));
}

export function formatTime(d: string | Date | undefined | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: APP_TIMEZONE }).format(new Date(d));
}

/** Minutes → "12h 30m" */
export function formatMinutes(min: number | undefined | null) {
  const m = Math.max(0, Math.round(min ?? 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function titleCase(s: string | undefined | null) {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function initials(name: string | undefined | null) {
  if (!name) return "U";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

