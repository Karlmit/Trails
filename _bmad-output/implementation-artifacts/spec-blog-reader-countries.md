---
title: 'Resolve countries for blog views behind a reverse proxy'
type: 'bugfix'
created: '2026-11-27'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The server reports all blog views as unknown when the proxy supplies an IP address and no country code.

**Approach:** Resolve the reader's country locally when a proxy supplies a usable IP address. Keep the configured country header and the existing aggregate counts.

</frozen-after-approval>

## Implementation Notes

- Added a default lookup for `X-Real-IP` and kept the existing country header as the first choice.
- Bundled a country-only IP database in the Docker image. Existing aggregates require no database migration.
- Verified country and daily totals through the existing statistics API with a test database.

## Review Triage Log

- Low. A client with direct access to the origin can supply an IP header. Attribution affects analytics only. The deployment instructions require the proxy to overwrite the header and document the opt-out for directly reachable deployments.
- Medium, fixed. A lookup exception now falls back to Unknown and the view still counts.
- Low. The database-backed case requires the same MMDB used by the app. It passed against the upstream dataset. The general endpoint tests also cover missing and malformed country headers.
- Low. The upstream rolling database is downloaded at image build time to keep country mappings current. The deployed image contains a fixed database and needs no runtime download.
- Low, fixed. UK now resolves to GB and geographic groupings fall through to the IP lookup.
