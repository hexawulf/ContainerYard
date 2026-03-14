/**
 * Drizzle client — CANONICAL for monitoring/alerting data (Neon PostgreSQL).
 *
 * Schema: shared/schema.ts (metrics, alerts, bookmarks, restarts, saved searches)
 * Used by: alertWorker, metricsAggregator, restartTracker, alerts routes, metrics routes
 *
 * When DATABASE_URL is a SQLite file URL, this module creates safe mock objects
 * that throw descriptive errors — all Drizzle-dependent features are gated by
 * the isSQLite checks in server/src/config/databaseCapabilities.ts.
 *
 * Auth/user data uses Prisma + SQLite instead (server/src/db/client.ts).
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

export const isSQLite = process.env.DATABASE_URL?.startsWith('file:');

if (!isSQLite) {
  neonConfig.webSocketConstructor = ws;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// For SQLite, create a mock pool that throws clear errors
// SQLite should use Prisma (server/src/db/client.ts) instead
const createSQLitePool = () => {
  return {
    query: () => {
      throw new Error(
        'SQLite database detected. Use Prisma (import from "@/db/client") instead of Drizzle/Neon for SQLite databases.'
      );
    },
    connect: () => Promise.resolve(),
    end: () => Promise.resolve(),
    on: () => {},
    removeListener: () => {},
  } as any;
};

export const pool = isSQLite 
  ? createSQLitePool()
  : new Pool({ connectionString: process.env.DATABASE_URL });

// Create Drizzle database client - only for PostgreSQL
// For SQLite, this returns a mock that throws helpful errors
export const db = isSQLite
  ? (new Proxy({} as any, {
      get: (target, prop) => {
        if (prop === 'query' || prop === 'select' || prop === 'insert' || prop === 'update' || prop === 'delete') {
          return () => {
            throw new Error(
              'SQLite database detected. DATABASE_URL points to a file URL, but this code requires PostgreSQL. ' +
              'Please either: 1) Use Prisma client instead (import from "@/db/client"), or 2) Set DATABASE_URL to a PostgreSQL connection string.'
            );
          };
        }
        return target[prop];
      }
    }))
  : drizzle({ client: pool, schema });
