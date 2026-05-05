import { log } from "../../vite";

/**
 * Database capability detection and utilities
 * Provides centralized SQLite vs PostgreSQL detection
 */

export const isSQLite = process.env.DATABASE_URL?.startsWith('file:') ?? false;
export const isPostgreSQL = !isSQLite && !!process.env.DATABASE_URL;

/**
 * Log a warning when a feature is disabled due to SQLite mode
 */
export function logSQLiteDisabled(featureName: string): void {
  log(`[SQLite Mode] ${featureName} is disabled. This feature requires PostgreSQL.`, "warn");
}

/**
 * Log an informational message about SQLite mode
 */
export function logSQLiteInfo(message: string): void {
  log(`[SQLite Mode] ${message}`, "info");
}

export async function requirePostgreSQLAsync<T>(
  featureName: string,
  callback: () => Promise<T>,
  defaultValue: T
): Promise<T> {
  if (isSQLite) {
    logSQLiteDisabled(featureName);
    return defaultValue;
  }
  return callback();
}
