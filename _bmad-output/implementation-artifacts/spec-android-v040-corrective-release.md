---
title: 'Recover expired sessions, unify Timeline bands, and add in-app document viewing'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '79b92d727c79f15a4ad722891aa0a3c10977192e'
context:
  - '/workspace/.planning/Clay-Design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Android can retain an expired server session indefinitely, leaving Ideas and URL-imported covers stale behind a generic error. Timeline section changes render as unrelated rounded islands whose rail collides with the outer curve, and Documents still delegates every file to external apps instead of providing the requested built-in PDF/image viewer.

**Approach:** Make authentication validity observable and recover expired sessions through login, render the Timeline as one continuous rounded trip band with seamless internal section transitions, and route cached PDFs/images into a native viewer with sharing/external-open actions in an overflow menu.

## Boundaries & Constraints

**Always:** Preserve cached data during auth/network failures; distinguish unauthorized responses from ordinary server/offline failures; keep valid offline startup usable when the server cannot be reached; retry normal sync after login. Round only the overall Timeline band, preserve internal rail continuity, and keep section colors/transition gradients. Open Documents images and PDFs inside Trails by default; cache through the authenticated repository first; share only `content://` URIs with temporary read permission.

**Never:** Delete Room data on 401, treat a 5xx/offline response as logout, store credentials for automatic relogin, round each Timeline section, let graph strokes overlap the overall rounded corners, request broad storage permission, expose raw file paths, or remove the external-open fallback for unsupported formats.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Expired session | Persisted token; authenticated endpoint returns 401 | Clear invalid session and show login instead of stale generic sync errors | Cached trip content remains in Room |
| Offline startup | Persisted token; validation fails with I/O error | Continue to cached app content | Do not clear session |
| Ideas refresh | Fresh login and web-created Idea/cover | Foreground sync persists Idea, metadata and selected authenticated cover | Independent non-401 errors remain retryable |
| Timeline | Multiple adjacent colored sections | One outer 24dp silhouette; internal transitions are flush | Rail/branches inset only at outer top/bottom |
| PDF/image | Cached or downloadable supported file | Open inside Trails with back navigation and overflow Share/Open externally | Show retry/error without crashing |
| Other file | Unsupported MIME/extension | Explain limitation and offer external open | Share remains available |

</frozen-after-approval>

## Code Map

- `android/app/src/main/java/com/trails/app/auth/TokenStore.kt`, `AuthRepository.kt`, `ui/login/LoginViewModel.kt` -- persisted session state and startup auto-entry; currently validates presence only.
- `android/app/src/main/java/com/trails/app/network/AuthInterceptor.kt`, `di/NetworkModule.kt` -- bearer injection and central response boundary; must ignore login-request 401 and ordinary failures.
- `android/app/src/main/java/com/trails/app/ui/nav/TrailsNavHost.kt` -- root navigation and new viewer route.
- `android/app/src/main/java/com/trails/app/ui/timeline/TimelineScreen.kt`, `graph/TimelineGraphColumn.kt` -- outer-band shape and graph endpoint geometry.
- `android/app/src/main/java/com/trails/app/ui/documents/DocumentsScreen.kt`, `DocumentsViewModel.kt` -- row tap/cache contract; replace external-only launch.
- `android/app/src/main/java/com/trails/app/util/FileOpener.kt`, `AndroidManifest.xml`, `res/xml/file_paths.xml` -- existing FileProvider boundary; extend for share and explicit external open.
- `android/app/src/main/java/com/trails/app/ui/documents/DocumentViewerScreen.kt` -- new Coil image and platform `PdfRenderer` viewer; no new storage permission or PDF dependency.

## Tasks & Acceptance

**Execution:**
- [x] Auth/network/root navigation -- validate stored sessions, clear only confirmed 401 sessions, and navigate to login without deleting cached data.
- [x] Ideas regression coverage -- prove expired-session recovery and fresh-session Ideas/photo synchronization behavior.
- [x] Timeline -- replace section-run rounding with overall-list boundaries and use shared outer endpoint geometry for rail/branches.
- [x] Documents/navigation/FileProvider -- add native image/PDF viewer, overflow Share/Open externally, unsupported fallback, stale-cache repair, and localized states.
- [x] Release -- bump to Android 0.40.0, run full tests/build/lint, review, push, and publish signed GitHub APK.

**Acceptance Criteria:**
- Given the retained expired token that currently produces the combined Ideas/photo banner, when 0.40 starts or receives 401, then it requires login and a successful login makes current server Ideas/covers available.
- Given adjacent Timeline sections, when rendered, then only the first and final trip edges are rounded and no graph stroke enters those corners.
- Given a PDF or image in Documents, when tapped, then it opens inside Trails; the three-dot menu can share it or open it in another app.

## Implementation Notes

The production HTTP service is reachable at `192.168.1.66:3018`, but it exposes no log endpoint and SSH rejects workspace keys. Both unauthenticated Ideas and photo APIs return the expected JSON 401. Repository contract comparison found no DTO mismatch; simultaneous endpoint failure plus the 30-day token TTL and presence-only Android startup check makes stale authentication the evidence-backed root cause.

Implementation and matrix tests passed on 2026-10-21. The full JVM unit/Compose suite, Android-test compilation, signed release assembly, and lint completed successfully (108 Gradle tasks). The platform `PdfRenderer` instrumentation test compiles but could not run because no ADB device is attached; JVM semantics tests exercise the PDF/image/unsupported viewer branches.

## Spec Change Log

## Review Triage Log

| Source | Verdict | Route | Evidence |
|---|---|---|---|
| blind: provisional false session state | high | patch | `hasSession` begins false before DataStore hydration, so root navigation can discard a valid restored stack. Use an explicit unknown state and gate redirects until hydration completes. |
| blind: late old-token 401 clears new login | high | patch | The interceptor captures the rejected token but clears unconditionally; an older in-flight response can erase a subsequently saved token. |
| blind: startup cancellation swallowed | medium | patch | The broad startup catch includes `CancellationException`, violating structured cancellation. |
| blind: unexpected validation failures treated as valid | medium | patch | Parsing/programming failures currently grant authenticated navigation; only understood connectivity failures should preserve offline access. |
| blind: raw path in viewer route | high | patch | The navigation route contains an encoded absolute path, directly violating the frozen no-raw-path boundary and weakening restoration. Resolve by attachment ID. |
| blind: stale viewer file action crash | medium | patch | Share/open rebuild a FileProvider URI without verifying the file still exists; stale cache can throw from toolbar actions. |
| blind: unhandled share target absence | medium | patch | Share does not catch launch failure, unlike external open, so the new action can crash. |
| blind: unbounded PDF bitmap allocation | high | patch | Width-only bounding permits extreme aspect ratios to allocate excessive height/pixels. Bound both dimensions and total pixels. |
| blind: duplicate document cache launches | medium | patch | Admission is non-atomic and state removal is not in `finally`, allowing duplicate downloads and premature re-enable. |
| blind: terminal PDF error | medium | patch | The matrix requires retry/error behavior, but PDF render failure has no retry action. |
| blind: auth race tests missing | medium | patch | The two demonstrated hydration/late-401 races have no deterministic regression coverage. |
| edge: late old-token 401 | high | patch | Same independently reported race; condition clearing on the still-current rejected token. |
| edge: MIME/extension precedence | medium | patch | Current `OR` classification lets an image extension override an explicit PDF MIME. Trust specific MIME and use extension only for generic/missing MIME. |
| edge: share chooser absence | medium | patch | Same independently reported unhandled launch failure. |
| verification: root navigation only tests predicate | medium | patch | Pre-verified gap: deleting actual collection/navigation wiring leaves predicate tests green; add host-level controllable-flow coverage or extract/test the navigation effect seam. |
| verification: Documents-to-viewer route untested | medium | patch | Pre-verified gap: direct viewer tests do not exercise attachment selection/route argument restoration, especially special filenames. |
| verification: rendered PDF output outside normal path | medium | patch | Pre-verified gap: the normal JVM test only sees the outer PDF tag even on render error; inject a renderer seam and assert ready-page semantics in the local suite while keeping the platform instrumentation test. |

## Design Notes

The Timeline should read as one vertical travel artifact, not stacked cards. Keep the section label pills and color transitions, but reserve outer rounding for the trip's first and last day. The viewer uses a calm dark media canvas, one PDF page at a time to bound memory, and a familiar overflow menu rather than crowding the toolbar.

## Verification

**Commands:**
- `cd android && ./gradlew -I /tmp/trails-build-output.init.gradle.kts -Pkotlin.project.persistent.dir=/tmp/trails-kotlin-persistent :app:testDebugUnitTest :app:assembleRelease :app:lintDebug --console=plain` -- all active tests, signed assembly, and lint succeed.

**Manual checks:**
- Install over 0.39, reauthenticate when prompted, confirm the production Idea/cover appears, inspect the Timeline endpoints, and open/share one PDF and one image from Documents.
