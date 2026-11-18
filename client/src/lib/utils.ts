import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function ensureArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? v as T[] : []
}

/** Lightweight relative time formatter (replaces date-fns formatDistanceToNow). */
export function formatRelativeTime(input: Date | string | number, addSuffix = true): string {
  const date = input instanceof Date ? input : new Date(input);
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (Number.isNaN(diffSec)) return "unknown";

  const abs = Math.abs(diffSec);
  let label: string;
  if (abs < 45) {
    label = "less than a minute";
  } else if (abs < 90) {
    label = "1 minute";
  } else if (abs < 2700) {
    label = `${Math.round(abs / 60)} minutes`;
  } else if (abs < 5400) {
    label = "about 1 hour";
  } else if (abs < 86400) {
    label = `about ${Math.round(abs / 3600)} hours`;
  } else if (abs < 172800) {
    label = "1 day";
  } else if (abs < 2592000) {
    label = `${Math.round(abs / 86400)} days`;
  } else if (abs < 31536000) {
    const months = Math.max(1, Math.round(abs / 2592000));
    label = months === 1 ? "about 1 month" : `${months} months`;
  } else {
    const years = Math.max(1, Math.round(abs / 31536000));
    label = years === 1 ? "about 1 year" : `${years} years`;
  }

  if (!addSuffix) return label;
  return diffSec >= 0 ? `${label} ago` : `in ${label}`;
}
