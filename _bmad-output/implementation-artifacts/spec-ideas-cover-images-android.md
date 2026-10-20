---
title: 'Show web-added Idea cover images in Android'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Android Ideas list hides cover photos added through the web app whenever their files have not already been cached locally. Photo metadata syncs correctly, but failed or unfinished bulk downloads leave `localPath` empty and the list never retries those selected covers.

**Approach:** Preserve the existing offline-first file rendering and primary-photo selection, while making the Ideas view model request on-demand caching for selected cover photos that lack local files so Room updates cause the cards to render them.

</frozen-after-approval>

## Implementation Notes

- Investigation: `IdeasViewModel.groups` already joins IDEA photos and selects primary/fallback covers; `IdeaCompactCard` intentionally renders `File(localPath)` only. `DocumentsRepository.ensurePhotoCached` is the established retry API used by blog detail.
- Scope: update the Ideas view-model flow and focused tests only; no API contract, database schema, or web behavior changes.
- Added a shared cover-selection helper and an Ideas view-model collector that retries caching only selected covers whose `localPath` is missing. Room's path update drives the existing UI without changing its offline-first rendering.
- Added focused unit coverage for primary selection, newest fallback, and excluding photos not owned by known Ideas.
- Review hardening: made newest fallback order-independent, delayed on-demand caching until full refresh completes to prevent duplicate file writes, and added coroutine coverage that verifies only missing selected covers are requested.

## Review Triage Log

- `medium` — Newest fallback depended on DAO ordering; patched with explicit `createdAt` comparison and an order-independent test.
- `medium` — On-demand caching could race the full refresh's bulk cache writes; patched by gating the retry pass on `isRefreshing == false`.
- `low` — A failed on-demand attempt has no timer-based retry, but the app already attempts during full sync and again after sync, on screen reopen, and through pull-to-refresh; rejected because background retry machinery is disproportionate to the remaining recoverable case.
- `medium` — Initial tests covered selection but not cache triggering; patched with a coroutine test proving only uncached selected covers are requested.
