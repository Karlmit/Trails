// Shared UUID shape check for route params read straight off the URL (Trip
// IDs, Section IDs). Every id in this schema is a Postgres `uuid` column
// (`@db.Uuid`), so a value that isn't UUID-shaped can never match a row --
// checking it up front turns what would otherwise be a raw Prisma
// cast-error/500 into a clean 404 (pages) or 400 (API routes).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
