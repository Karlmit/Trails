import { vi } from 'vitest';

// Route Handlers call `revalidatePath` (AD-12). Outside a real Next.js
// server request context (i.e. when a test imports and calls a Route
// Handler function directly), Next's cache APIs throw because there's no
// active request store. Tests care about the business/DB behavior, not
// this caching side-channel, so it's mocked out globally.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Without DATABASE_URL set (the out-of-the-box state -- only .env.example
// exists until a developer copies it to .env or points it at a live
// Postgres), every `describe.skipIf(!hasTestDatabase)(...)` integration
// suite skips silently. A plain `npm test` run would then look fully green
// -- "X passed" -- while covering none of the DB-backed I/O matrix rows.
// Print a loud, impossible-to-miss warning so that state is visible instead
// of misleadingly looking complete.
if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n' +
      '⚠️  DATABASE_URL is not set -- all integration tests (tests/integration/**, ' +
      'and any other suite gated on hasTestDatabase) are being SKIPPED, not passed.\n' +
      '   This run does not cover the DB-backed I/O matrix rows (auth, sessions, ' +
      'Trip/Section CRUD, overlap rejection).\n' +
      '   Set DATABASE_URL (see .env.example) and re-run against a live Postgres ' +
      'for a complete result.\n',
  );
}
