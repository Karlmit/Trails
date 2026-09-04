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
Mode, Guest/public sharing, Blog-post push notifications, and
Admin-managed accounts are all in place.

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
      # Optional -- see "Notifications for new blog posts" below. Leave these
      # out and the notification opt-in never appears at all.
      VAPID_PUBLIC_KEY: ""
      VAPID_PRIVATE_KEY: ""
      VAPID_SUBJECT: "mailto:you@example.com"
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

### Notifications for new blog posts

Readers can ask to be notified whenever a new blog post is published — the
notification opens that post directly. It works for signed-in users and for
guests reading a public trip's blog: the ask appears as a small card on the
trip's Blog page and on an individual post's page (so a shared link offers
it too), plus a permanent on/off switch in **Settings** for signed-in users.
Notifications are per browser, so each device opts in separately.

This is a web feature only — it has nothing to do with the Android app.

Nothing appears anywhere until you set a VAPID keypair, so the setup below
is not optional if you want notifications.

#### What VAPID is, briefly

A browser that opts in mints its own private "mailbox" URL at its vendor's
push service (`fcm.googleapis.com` for Chrome and Android,
`web.push.apple.com` for Safari). Trails posts a notification to that
mailbox and the push service delivers it to the device. VAPID (Voluntary
Application Server Identification) is a keypair you generate yourself so
those push services can tell a delivery request genuinely came from your
Trails instance and not from anyone who got hold of a mailbox URL:

| Variable | What it is |
| --- | --- |
| `VAPID_PUBLIC_KEY` | Handed to the browser at subscribe time; each mailbox is permanently bound to it. |
| `VAPID_PRIVATE_KEY` | Stays on the server and signs every send. A secret — keep it out of version control. |
| `VAPID_SUBJECT` | A `mailto:` address (or https URL). Only used if a push service needs to contact an operator about a misbehaving sender; never shown to subscribers. |

No third-party account and no cost — you generate the pair yourself. The one
rule is to **keep it stable**: every existing subscription is tied to the
public key it was created with, so replacing the keypair silently orphans
every subscriber and they all have to opt in again.

#### 1. Generate the keypair (once)

```sh
npx web-push generate-vapid-keys
```

That prints a `Public Key:` and a `Private Key:` line. Keep them somewhere
safe — you will need the same pair again on every future update.

#### 2. Set the three variables on the container

**Docker Compose** (including Unraid's Compose plugin — Compose → your
Trails stack → *Edit Stack*). Add them to the `trails` service's existing
`environment:` block, at the same indentation as `DATABASE_URL`:

```yaml
    environment:
      DATABASE_URL: postgresql://trails:trails@db:5432/trails?schema=public
      NODE_ENV: production
      COOKIE_SECURE: "true"
      VAPID_PUBLIC_KEY: "<the public key you generated>"
      VAPID_PRIVATE_KEY: "<the private key you generated>"
      VAPID_SUBJECT: "mailto:you@example.com"
```

Then bring the stack back up (*Compose Up*, or `docker compose up -d` —
`docker compose pull` first if you are also updating the image).

To keep the private key out of a file you might commit or share, put the
values in a `.env` next to the compose file instead (plain
`VAPID_PUBLIC_KEY=...` lines, no indentation and no quotes) and reference
them from the service:

```yaml
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
      VAPID_SUBJECT: ${VAPID_SUBJECT:-}
```

**Unraid's plain Docker template** (no compose): *Edit* the container →
**Add another Path, Port, Variable, Label or Device** → Config Type
**Variable** → Key `VAPID_PUBLIC_KEY`, Value the public key → *Add*. Repeat
for `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`, then *Apply* to recreate the
container.

#### 3. Serve Trails over HTTPS

Service Workers and the Push API only exist in a secure context, so
notifications cannot work on a plain-HTTP deployment — put your
TLS-terminating reverse proxy (Nginx Proxy Manager, Traefik, SWAG, …) in
front of Trails first, and set `COOKIE_SECURE: "true"` while you are there.
`http://localhost` is the one exemption, which is enough for local
development.

#### 4. Check that it worked

```sh
docker exec <trails-container> printenv | grep VAPID
```

Then open `/settings` in a browser: a **Notifications** row with On/Off
appears once the keys are live. Turn it on, publish a blog post, and the
notification should arrive on that device.

| What you see in Settings | What it means |
| --- | --- |
| No Notifications row at all | The keys never reached the container — check step 2 and that you recreated it, not just restarted the stack's proxy. |
| "Notifications are not set up on this server." | Same cause: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` is empty or only one of the two is set. |
| "Notifications need a secure (HTTPS) connection." | You are reaching Trails over plain HTTP (e.g. a LAN IP and port) — see step 3. |
| "Notifications are blocked for this site." | The browser denied permission earlier. Only the visitor can undo that, in the browser's site settings. |
| An "add Trails to your Home Screen" hint | iPhone/iPad, see below. |

On iPhone and iPad there is one extra requirement, imposed by iOS itself:
Safari only grants notification permission to a site that has been added to
the Home Screen (Share → Add to Home Screen) and opened from there. Trails
ships a web app manifest so that install works properly; the Settings page
shows this hint when it applies. Android Chrome and desktop browsers work
straight from an ordinary tab.

#### What gets sent, and to whom

Publishing a post notifies its subscribers exactly once. Unpublishing and
re-publishing the same post does not notify anyone a second time, and a
guest is never notified about a draft, a post marked Private, or any post on
a private trip. Subscriptions whose browser has gone for good are cleaned up
automatically the next time a post is published.

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
