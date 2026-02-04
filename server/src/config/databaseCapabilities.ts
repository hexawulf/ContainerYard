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
  console.warn(`[SQLite Mode] ${featureName} is disabled. This feature requires PostgreSQL.`);
}

/**
 * Log an informational message about SQLite mode
 */
export function logSQLiteInfo(message: string): void {
  console.log(`[SQLite Mode] ${message}`);
}

/**
 * Guard function that executes a callback only if PostgreSQL is available
 * Returns a default value if SQLite mode is active
 */
export function requirePostgreSQL<T>(
  featureName: string,
  callback: () => T,
  defaultValue: T
): T {
  if (isSQLite) {
    logSQLiteDisabled(featureName);
    return defaultValue;
  }
  return callback();
}

/**
 * Async version of requirePostgreSQL
 */
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

/**
 * Check if database persistence is available for a feature
 * Returns true if either:
 * - PostgreSQL is configured (full functionality)
 * - SQLite is configured but the feature supports SQLite
 */
export function isPersistenceAvailable(requiresPostgreSQL = false): boolean {
  if (requiresPostgreSQL) {
    return isPostgreSQL;
  }
  return !!process.env.DATABASE_URL;
}
