---
title: 'Finish Timeline clay styling and make Ideas sync deterministic'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '47753471384738bfb34755e2895ded675fc7af94'
context:
  - '/workspace/.planning/Clay-Design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Android 0.38 still shows a mostly flat Timeline with visibly square/clipped section-band endpoints, while Ideas created on the web and their URL-imported cover photos still fail to appear reliably after opening the Android Ideas screen.

**Approach:** Give the Timeline unmistakable but restrained Clay depth with smoothly rounded section runs and sculpted entry surfaces, and replace the Ideas screen's opaque WorkManager-only refresh with a deterministic foreground Ideas/Photo sync whose result is visible and testable.

## Boundaries & Constraints

**Always:** Preserve timeline chronology, continuous graph lanes, section transitions, today behavior, entry navigation, offline reads, and compact density. Sync Ideas and IDEA photo metadata independently of unrelated trip resources; persist Ideas before attempting image downloads; show sync errors without deleting valid cached content; download URL-imported photos through the authenticated API and display only verified local files.

**Never:** Hide sync failures, clear cached Ideas because another resource failed, depend on remote image URLs at render time, change the web UI or database schema, add heavy blur effects to lazy rows, or release without tests proving a web-created Idea and photo metadata reach the screen model.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Web Idea | API returns a newly created Idea | Opening Ideas persists and displays it immediately | Cached Ideas remain if the request fails |
| URL cover | API returns IDEA Photo metadata | Metadata persists, bytes download through authenticated API, verified local file becomes the cover | Idea remains visible; inline error/retry remains available |
| Partial server failure | Ideas succeeds but Photos fails, or vice versa | Successful domain is committed independently | Failure is surfaced and retryable without rollback |
| Timeline section run | First/middle/last days in a colored section | Band begins and ends with smooth 24dp geometry; continuous rail remains unclipped between days | Unsectioned days retain the warm canvas |
| Dense itinerary | Multiple entries and long labels | Entries read as tactile compact surfaces without losing scan density or 48dp targets | Text wraps; no essential action clips |

</frozen-after-approval>

## Code Map

- `android/app/src/main/java/com/trails/app/ui/timeline/TimelineScreen.kt` -- section-run boundaries and entry presentation; preserve zero-gap graph continuity between middle rows.
- `android/app/src/main/java/com/trails/app/ui/timeline/graph/TimelineGraphColumn.kt` -- rail/branch drawing; terminate cleanly at rounded run bounds without changing layout ordering.
- `android/app/src/main/java/com/trails/app/ui/ideas/IdeasViewModel.kt` -- replace fire-and-forget WorkManager refresh for this screen with observable foreground synchronization and error state.
- `android/app/src/main/java/com/trails/app/data/IdeaRepository.kt` -- authoritative Idea API-to-Room projection; keep replacement semantics only after a successful complete response.
- `android/app/src/main/java/com/trails/app/data/DocumentsRepository.kt` -- expose focused Photo metadata sync/cache behavior so attachment or unrelated trip failures cannot block covers.
- `android/app/src/main/java/com/trails/app/ui/ideas/IdeasScreen.kt` -- show non-destructive sync failure/retry while continuing to render cached groups and verified local covers.
- `app/api/v1/ideas/route.ts` and `app/api/v1/photos/route.ts` -- verified contracts return all trip Ideas and IDEA-owned Photos; do not change unless an executable contract test proves a server defect.

## Tasks & Acceptance

**Execution:**
- [x] `TimelineScreen.kt` / `TimelineGraphColumn.kt` -- introduce rounded section-run endpoints and compact sculpted entry surfaces while retaining continuous graph geometry.
- [x] `IdeaRepository.kt` / `DocumentsRepository.kt` -- add focused, independently failure-isolated foreground sync operations for Ideas and IDEA Photos.
- [x] `IdeasViewModel.kt` / `IdeasScreen.kt` -- drive foreground sync on entry and pull-to-refresh, expose completion/error, retain cached results, and retry cover caching.
- [x] Android tests -- prove new API Ideas appear, photo metadata survives independent failures, cached content survives errors, and Timeline boundary classification is correct.
- [x] Release -- bump Android version, run unit/Compose/build/lint checks, publish a signed GitHub APK only after review passes.

**Acceptance Criteria:**
- Given a web-created Idea absent from Room, when Ideas opens online, then the Idea is persisted and rendered during that screen session.
- Given its URL-imported cover metadata, when photo sync succeeds, then authenticated bytes are cached and the card renders the verified local file.
- Given either endpoint fails, when refresh completes, then successful data remains visible and the failure is explicitly shown with retry.
- Given the first and last colored Timeline rows, when rendered, then the band and rail terminate with smooth rounded geometry rather than square clipping.
- Given dense itinerary content, when scrolled, then entry surfaces are visibly sculpted, readable, and lightweight.

## Implementation Notes

- Verification passed on 2026-10-20: `:app:testDebugUnitTest`, `:app:assembleRelease`, and `:app:lintDebug` (98 tasks).
- Three-layer review completed; release-blocking refresh, cover-selection, cache-integrity, and continuous-rail findings were patched and reverified.

## Spec Change Log

## Review Triage Log

| Source | Verdict | Route | Evidence |
|---|---|---|---|
| edge: attachment truncation | medium | defer | `downloadAttachment` publishes bytes without validating the metadata length; this is real but belongs to the pre-existing document-cache path, not the focused Ideas-cover correction. |
| edge: timeline rail gap | medium | patch | The 8dp top/bottom inset produces a visible discontinuity at adjacent row boundaries and conflicts with the frozen continuous-rail requirement. |
| edge: duplicate refresh | medium | patch | `isRefreshing` is checked before the coroutine sets it, so two calls on a queued dispatcher can both launch. |
| edge: cancellation leaves refresh active | medium | patch | Cancellation exits before the final state assignment; a `finally` cleanup is required. |
| edge: web Idea not proven through screen model | medium | patch | Repository and helper tests do not construct the screen-facing refresh/group pipeline, so incorrect wiring could pass. |
| blind: duplicate refresh admission | medium | patch | Same independently reported race: the guard and state transition are not atomic. |
| blind: refresh cleanup | medium | patch | Same independently reported missing `finally` cleanup on cancellation/unexpected exceptions. |
| blind: downloads all IDEA photos | medium | patch | `syncIdeaPhotos` selects every uncached IDEA photo, so an unused gallery image can delay or fail cover refresh. |
| blind: attachment repair is non-atomic | medium | defer | Direct-to-destination attachment repair can replace a usable file with partial bytes; this is a real pre-existing document-cache issue outside this corrective story. |
| blind: rail boundary discontinuity | medium | patch | Same independently reported 8–16dp gap introduced by endpoint insets. |
| blind: absent trip-cover fallback | low | defer | The fallback is absent when the cover field itself is blank; this is in the prior trip-list redesign, not the Timeline/Ideas correction. |
| blind: TripRefresher flow completion | false | reject | WorkManager's `getWorkInfoByIdFlow` is a long-lived database flow and does not normally complete when a row is temporarily absent; nulls are intentionally filtered. |
| blind: ensureIdeaCoversCached naming/validation | low | reject | The callback intentionally delegates validation/repair to `cachePhoto`; the only production caller supplies that validating operation, so no redundant download occurs. |
| blind: accessibility contract test is shallow | low | defer | The token-only test does not render font-scale/RTL configurations; useful follow-up, but not evidence that the focused sync or section endpoints are defective. |
| blind: Ideas tests bypass refresh | medium | patch | Direct helper tests cannot catch missing callback wiring, duplicate admission, cleanup, or Room-flow-to-group regressions. |
| blind: real cache writer untested | medium | patch | Mocked `FileCacheManager` tests cannot detect removal of size validation, temp cleanup, or atomic replacement. |
| blind: documentation status mismatch | false | reject | The spec is deliberately `in-review` and its release box remains open until this review and publication complete; the version bump alone is not a release claim. |
| verification: Ideas foreground wiring | medium | patch | Pre-verified gap: no test constructs the consumer path or observes repository-backed groups after refresh. |
| verification: photo atomic replacement | medium | patch | Pre-verified gap: all current repository tests mock the cache writer, leaving its integrity contract uncovered. |
| verification: Timeline rendered application | medium | patch | Boundary tests cover only classification; an executable seam must assert that rail endpoints remain continuous when boundary flags are applied. |
| verification other: duplicate admission | medium | patch | Same race independently identified from the guard occurring before coroutine launch. |

## Design Notes

Treat a contiguous colored section run as one visual clay panel: only its external top and bottom edges round; internal rows remain flush so the graph reads continuously. Entry content uses compact warm-white tonal surfaces with one subtle elevation layer. Ideas refresh must be synchronous from the screen's perspective even though it uses coroutines: independent API results commit to Room and the UI receives an explicit success/failure state.

## Verification

**Commands:**
- `cd android && ./gradlew -I /tmp/trails-build-output.init.gradle.kts -Pkotlin.project.persistent.dir=/tmp/trails-kotlin-persistent :app:testDebugUnitTest :app:assembleRelease :app:lintDebug --console=plain` -- expected: all active tests, signed release assembly, and lint succeed.

**Manual checks:**
- On a device with the production account, create an Idea and URL cover on web, open/pull-refresh Ideas, and confirm the new item plus cover; inspect Timeline section starts/ends against the supplied screenshot.
