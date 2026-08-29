import { defineConfig } from "prisma/config";

/**
 * Prisma 7 CLI configuration.
 *
 * In v7 the datasource URL is no longer read from `schema.prisma`: the CLI reads
 * it from here, and the runtime client receives it through a driver adapter
 * (`@prisma/adapter-pg`, see `src/lib/db.ts`).
 *
 * `process.env` is read directly rather than via Prisma's `env()` helper so a
 * missing variable resolves to `undefined` instead of throwing — that keeps
 * `prisma generate` working on a fresh clone with no `.env.local`, since
 * generate needs no database connection.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
