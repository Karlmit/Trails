import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Single shared Prisma Client instance. Prisma 7 requires an explicit
// driver adapter at runtime (schema.prisma no longer carries a `url`,
// see prisma.config.ts and the note at the top of schema.prisma).
//
// All Prisma calls happen inside Server Components, Server Actions, or
// Route Handlers -- never a file marked "use client" (Consistency
// Conventions table).

declare global {
  // eslint-disable-next-line no-var
  var __trailsPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function getClient(): PrismaClient {
  if (!globalThis.__trailsPrisma) {
    globalThis.__trailsPrisma = createClient();
  }
  return globalThis.__trailsPrisma;
}

// Lazily constructed behind a Proxy so importing this module never throws
// just because DATABASE_URL isn't set yet -- only actually querying does.
// This keeps `npm test` able to import Route Handlers (which import this
// module) and skip DB-backed suites cleanly when no test database is
// configured, without weakening the real fail-fast behavior at runtime:
// the first real query still throws immediately if DATABASE_URL is missing.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    // Top-level client methods ($disconnect, $transaction, ...) must stay
    // bound to the real client instance, not this Proxy, when invoked as
    // `prisma.$method()`. Model delegates (prisma.user, prisma.trip, ...)
    // are already objects bound internally by Prisma and pass through as-is.
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
