#!/bin/sh
set -e

# AD-13: schema migrations run from the app container's entrypoint, never
# ad hoc -- this is the only place `prisma migrate deploy` is invoked
# against the persistent Postgres volume, before the Next.js server starts.
echo "[entrypoint] Applying database migrations…"
npx prisma migrate deploy

echo "[entrypoint] Starting Trails…"
exec "$@"
