---
title: 'Restore Android Ideas sync and URL-imported covers'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Android can omit complete Ideas created on the web and all their cover images. The global trip sync stops at the first unrelated resource failure, photo metadata is coupled behind attachment sync, refresh completion is reported too early, and cached photo paths are trusted even when their files are missing or corrupt; URL imports can also produce GIFs that Android has no explicit decoder for.

**Approach:** Make trip resource synchronization failure-isolated so Ideas and Photos still update, decouple photo metadata from attachment failures, wait for real WorkManager completion, repair invalid cached files safely, support URL-imported GIF covers, retain unknown-section Ideas in the unsectioned group, and increase list thumbnails slightly before publishing a new Android release.

</frozen-after-approval>

## Implementation Notes

- The v0.36 follow-up established that complete Ideas were missing too, so the fix targets the shared fail-fast sync chain rather than image rendering alone.
- URL imports are stored as ordinary server-side Photo bytes; added Coil GIF support because URL imports can introduce that accepted format.
- Corrected WorkManager completion tracking, isolated resource sync failures, decoupled Photo metadata from Attachments, validated cached files, and made photo replacement atomic.
- Kept Ideas visible when their Section is temporarily absent locally, enlarged list covers from 52dp to 60dp, and prepared Android 0.37.0.
- Review hardening: preserved coroutine cancellation, made refresh admission/reset atomic, applied cache validation to every synced Photo, and required cached/downloaded byte counts to match server metadata.
- Follow-up requested during implementation: add an in-app PDF/image viewer with a three-dot Share/Open externally menu. Kept separate from this urgent Ideas corrective release because it is an independently shippable feature.
- Investigation: `IdeasViewModel.groups` already joins IDEA photos and selects primary/fallback covers; `IdeaCompactCard` intentionally renders `File(localPath)` only. `DocumentsRepository.ensurePhotoCached` is the established retry API used by blog detail.
- Scope: update the Ideas view-model flow and focused tests only; no API contract, database schema, or web behavior changes.
- Added a shared cover-selection helper and an Ideas view-model collector that retries caching only selected covers whose `localPath` is missing. Room's path update drives the existing UI without changing its offline-first rendering.
- Added focused unit coverage for primary selection, newest fallback, and excluding photos not owned by known Ideas.
- Review hardening: made newest fallback order-independent, delayed on-demand caching until full refresh completes to prevent duplicate file writes, and added coroutine coverage that verifies only missing selected covers are requested.

## Review Triage Log

- `false` — Coil GIF decoder registration is automatic: the resolved `coil-gif` AAR contains `META-INF/services/coil3.util.DecoderServiceLoaderTarget`.
- `high` — Failure isolation caught coroutine cancellation; patched both coordinator and document sync paths to rethrow `CancellationException` immediately.
- `medium` — Refresh admission could enqueue twice and remain stuck after an exception; patched by claiming state before launch and resetting it in `finally`.
- `medium` — Bulk sync skipped stale non-null paths; patched so every Photo goes through shared cache validation.
- `medium` — Non-empty truncated files could be trusted; patched cached and downloaded files to require the exact server metadata byte count, with regression coverage.
- `low` — Integration tests do not fake the complete WorkManager/repository chain; rejected for this corrective release because the paths compile, focused cache/grouping behavior is covered, and full unit/build/lint verification passes. A realistic integration test would require new test seams or mocking infrastructure disproportionate to this fix.
- `medium` — Newest fallback depended on DAO ordering; patched with explicit `createdAt` comparison and an order-independent test.
- `medium` — On-demand caching could race the full refresh's bulk cache writes; patched by gating the retry pass on `isRefreshing == false`.
- `low` — A failed on-demand attempt has no timer-based retry, but the app already attempts during full sync and again after sync, on screen reopen, and through pull-to-refresh; rejected because background retry machinery is disproportionate to the remaining recoverable case.
- `medium` — Initial tests covered selection but not cache triggering; patched with a coroutine test proving only uncached selected covers are requested.

## Spec Change Log

- The v0.36 release did not resolve the report, and the user clarified that complete web-created Ideas are also missing. Expanded the fix from metadata-only cover retries to the shared trip-sync failure path, invalid cached files, URL-imported GIF decoding, unknown-section grouping, and the requested 60dp thumbnail. The user explicitly requested a new release.
