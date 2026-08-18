# Trails

A self-hosted trip-planning and travel-journal app. The Timeline is the whole
point: it's the first thing you see, it always knows where "now" is, and it
carries a trip from a loose list of ideas through the trip itself to a
permanent personal archive.

Trails is built for a household or a small group of travelers running their
own instance — not a multi-tenant SaaS product.

**Status:** feature-complete for v1. Auth, Trips, Sections, the Timeline,
itinerary content (Stays, Transport, Activities, Notes, Blog), Ideas,
Checklists, Budget, Documents, Important Info, Tags/Links/Photos, Travel
Mode, Guest/public sharing, and Admin-managed accounts are all in place.

## Running it (Docker Compose)

Trails ships as a prebuilt image from GitHub Container Registry, published on
every push to `main` (tag `edge`) and every version tag (tags `latest`,
`1.2.3`, `1.2`, `1`). This is the setup to use for Unraid's Docker Compose
plugin or any other self-hosted Docker Compose environment.

```yaml
services:
  trails:
    image: ghcr.io/karlmit/trails:latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://trails:trails@db:5432/trails?schema=public
      NODE_ENV: production
      # Only set to "true" once Trails sits behind your own TLS-terminating
      # reverse proxy (Nginx Proxy Manager, Traefik, SWAG, ...). Leave "false"
      # for plain HTTP -- setting "true" without HTTPS in front makes the
      # browser silently drop the login cookie, so you'll never stay logged in.
      COOKIE_SECURE: "false"
    ports:
      - "3018:3000"
    volumes:
      - trails_uploads:/data/uploads

  db:
    image: postgres:18
    restart: unless-stopped
    environment:
      POSTGRES_USER: trails
      # Change this before first start -- it can't be changed later without
      # recreating the database.
      POSTGRES_PASSWORD: trails
      POSTGRES_DB: trails
    volumes:
      - trails_pg-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trails -d trails"]
      interval: 5s
      timeout: 5s
      retries: 20

volumes:
  trails_pg-data:
  trails_uploads:
```

Bring it up, then open `http://<host>:3018` (port 3018 is just this example's
choice — map it to whatever's free on your host):

```sh
docker compose up -d
```

The first account you create is automatically an Admin, and sign-up closes
permanently the moment that account exists — there's no public registration
after that. Every other authenticated User has full access to every Trip;
Trails is built for one trusted household, not multiple isolated accounts.

### Image tags

| Tag | What it is |
| --- | --- |
| `latest` | The most recent tagged release. |
| `1.2.3`, `1.2`, `1` | A specific version, pinned. |
| `edge` | Whatever is on `main` right now — may be ahead of any release, use for testing only. |

### Updating

```sh
docker compose pull
docker compose up -d
```

Database migrations run automatically against the persistent Postgres volume
when the `trails` container starts.

## Development

Requires Docker (for Postgres and for building the production image) and
Node.js 24+ for local iteration.

```sh
git clone https://github.com/Karlmit/Trails.git
cd Trails
npm install
docker compose up --build
```

`docker compose.yml` at the repo root builds the image from source (unlike
the published-image example above) — this is the loop for local development.

Run the test suite (unit tests always run; the integration suite needs a
reachable `DATABASE_URL`):

```sh
npm test
npm run typecheck
```

## Architecture

Next.js 16 (App Router) monolith — Server Components for reads, versioned
Route Handlers under `/api/v1` for mutations and for the future Android
client — backed by PostgreSQL 18 via Prisma ORM 7. See the project's
architecture and product docs for the full set of decisions this is built on.
