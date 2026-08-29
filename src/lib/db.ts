import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { getDatabaseUrl, isDbConfigured } from "@/lib/env";

/**
 * PrismaClient singleton.
 *
 * Next's dev server re-imports modules on every edit; a fresh client per reload
 * would exhaust the connection pool, so the instance is stashed on globalThis.
 *
 * Constructed lazily so a bare checkout with no DATABASE_URL doesn't instantiate
 * a client that throws on import — /api/health reports the unconfigured state
 * instead of the app failing to boot.
 *
 * Deliberately no `import "server-only"`. That guard would keep this out of a
 * client bundle, but it would also make the module unimportable from
 * `scripts/eval.ts`, and the eval harness has to exercise the *same* data access
 * the application uses. Numbers produced through a parallel code path are
 * numbers about a system nobody runs. `@prisma/client` pulls in Node built-ins,
 * so a client component importing this fails loudly at build time regardless.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getDb(): PrismaClient {
  if (!isDbConfigured()) {
    throw new Error("Postgres is not configured. Set DATABASE_URL (see .env.example).");
  }
  if (!globalForPrisma.prisma) {
    // Prisma 7: the connection comes from a driver adapter, not the schema.
    const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}
