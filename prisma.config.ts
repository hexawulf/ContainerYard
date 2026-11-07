/**
 * Prisma CLI configuration (replaces the deprecated package.json#prisma key,
 * which Prisma 7 removes).
 *
 * With a config file, the Prisma CLI no longer loads .env on its own, so
 * dotenv is imported here; otherwise `prisma db push` etc. would not see
 * DATABASE_URL. The datasource URL itself stays in schema.prisma
 * (env("DATABASE_URL")); moving it here is part of the Prisma 7 upgrade.
 */
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "server/prisma/schema.prisma",
  migrations: {
    path: "server/prisma/migrations",
    seed: "node server/prisma/seed.js",
  },
});
