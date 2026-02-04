import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Check if using SQLite (file-based database)
const isSQLite = process.env.DATABASE_URL?.startsWith('file:');

// Only configure WebSocket for Neon/PostgreSQL connections
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
