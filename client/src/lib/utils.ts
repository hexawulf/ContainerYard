import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function ensureArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? v as T[] : []
}
