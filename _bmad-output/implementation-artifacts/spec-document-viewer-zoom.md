---
title: 'Fit-to-screen and pinch zoom for document previews'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '721a87b14cb4cb2a7c7ed8a3c3474c27f46051f6'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The built-in PDF viewer displays pages at a small intrinsic size, and neither PDF pages nor images support pinch zoom, making travel documents difficult to inspect.

**Approach:** Make each supported preview fit the available viewer viewport at its resting scale, then add bounded pinch-to-zoom and pan behavior shared by PDFs and images.

## Boundaries & Constraints

**Always:** Treat 1× as fit-to-viewport; support pinch zoom and panning for both PDF and image previews; clamp scale and translation so content remains recoverable; reset the transform when the file or PDF page changes; preserve the existing back navigation, PDF paging controls, loading/error states, and overflow Share/Open externally actions.

**Never:** Add broad storage permissions, expose file paths, remove external-open/share capabilities, make page controls inaccessible, retain a previous page's zoom on a new page, or introduce unbounded bitmap allocation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| PDF opens | Rendered portrait or landscape page | Page uses the full available canvas while preserving aspect ratio | Existing retry state remains available if rendering fails |
| Image opens | Cached supported image | Image fits the canvas while preserving aspect ratio | Existing image loading/error state remains visible |
| Transform | Pinch and drag | Scale is bounded to 1–5× and pan is constrained to the zoomed content | Returning to 1× recenters content |
| Page/file changes | Next/previous PDF page or new preview | Transform resets to fit-to-screen | No stale translation or scale carries over |

</frozen-after-approval>

## Code Map

- `android/app/src/main/java/com/trails/app/ui/documents/DocumentViewerScreen.kt` -- image/PDF preview UI, PDF rendering, and the shared zoom transform boundary; replace intrinsic/max-only PDF sizing with a viewport-filling canvas.
- `android/app/src/test/java/com/trails/app/ui/documents/DocumentViewerTest.kt` -- pure viewer logic tests; add deterministic scale and pan-clamping coverage.
- `android/app/src/test/java/com/trails/app/ui/documents/DocumentViewerSemanticsTest.kt` -- Compose branch coverage; verify both supported formats expose the zoomable viewport and PDF ready content still renders.
- `android/app/build.gradle.kts` -- release version bump to 0.41.0 / code 41.

## Tasks & Acceptance

**Execution:**
- [x] `DocumentViewerScreen.kt` -- add reusable zoom/pan state and gesture handling, give PDF pages a full viewport canvas, and reset transforms by content identity.
- [x] Viewer unit and semantics tests -- cover bounds, reset-safe state, and both image/PDF zoom containers.
- [x] `build.gradle.kts` -- prepare Android 0.41.0.
- [x] Release -- run unit tests, Android-test compilation, signed release assembly and lint; review, push, and publish the signed GitHub APK.

**Acceptance Criteria:**
- Given a PDF or image, when it first opens, then it is centered and fit as large as its aspect ratio permits in the available screen area.
- Given a supported preview, when the user pinches and pans, then it zooms smoothly up to 5× without becoming irretrievably offscreen.
- Given a zoomed PDF page, when the user changes page, then the new page opens centered at fit scale and paging controls remain operable.

## Implementation Notes

Implemented one clipped, aspect-aware zoom viewport shared by PDF and image previews. Scale is bounded to 1–5×, translation is clamped to the scaled fitted content, pinch preserves the gesture centroid, viewport changes reclamp, image gestures activate only after load success, and transform state resets on document/page identity changes. The full 108-task verification command passed with the signed 0.41.0 APK.

## Spec Change Log

- Review loop 1: Review found viewport-based pan bounds, center-anchored zoom, and missing resize/loading handling. Implementation guidance now requires bounds derived from the aspect-fit content rectangle, centroid-preserving zoom, resize reclamping, and disabled gestures until image success. KEEP the shared clipped viewport, 1–5× limits, full-canvas PDF layout, controls outside the gesture surface, and page/file reset behavior.

## Review Triage Log

| Source | Verdict | Route | Evidence |
|---|---|---|---|
| blind/edge: viewport-sized pan bounds | high | patch | The transformed layer fills the viewport while the painted document may be letterboxed; viewport bounds can move narrow content fully offscreen. Bounds must use the fitted content size. |
| blind/edge: discarded gesture centroid | medium | patch | The callback ignores the supplied centroid, so an off-center pinch scales around screen center and moves the inspected point away from the fingers. |
| blind/edge: resize does not reclamp | medium | patch | Size state changes do not update the existing translation, which can exceed bounds after rotation or split-screen resizing. |
| blind: same-path replacement retains transform | false | reject | Viewer routes are attachment-ID scoped and a selected attachment is not replaced while the destination remains composed; PDF page identity also includes its index. |
| blind: no non-pinch accessibility zoom action | low | reject | The requested interaction is pinch zoom; adding a separate control surface is beyond this corrective release and the content remains available at fit scale. |
| blind/verification: gesture wiring and resets not exercised | medium | patch | Current semantics tests only find tags; deleting pointer wiring or identity keys would leave them green. Add observable transform semantics and consumer-level gesture/reset tests. |
| blind/edge: gestures active during image loading/error | medium | patch | The outer gesture surface is active before Coil succeeds, so a user can preload a displaced transform. Gate transforms on successful image loading. |
| verification: fit layout only asserted by presence | medium | patch | Existing assertions cannot detect restoration of intrinsic-sized PDF behavior. Add deterministic portrait/landscape fit calculations and viewport bounds coverage. |

## Implementation Guidance

- Derive the resting painted width/height from the content aspect ratio and the measured viewport; clamp translation with `max(0, (paintedDimension * scale - viewportDimension) / 2)`.
- Preserve the point beneath the gesture centroid when scale changes, then apply pan and clamp. Re-clamp immediately when viewport dimensions change.
- Make transform state observable through internal semantics so Compose tests can verify pinch input and identity-driven reset without relying on screenshots.
- For images, read intrinsic dimensions without decoding the full bitmap and enable gestures only after Coil reports success. PDFs already expose bitmap dimensions.

## Design Notes

Use one dark, clipped viewer canvas for both content types. Apply transforms at the display layer rather than rerendering during each gesture; continue rendering one bounded PDF bitmap per page so zoom interaction does not multiply memory use.

## Verification

**Commands:**
- `cd android && ./gradlew -I /tmp/trails-build-output.init.gradle.kts -Pkotlin.project.persistent.dir=/tmp/trails-v041-kotlin :app:testDebugUnitTest :app:compileDebugAndroidTestKotlin :app:assembleRelease :app:lintDebug --console=plain` -- unit/Compose tests, Android-test compilation, signed APK, and lint all succeed.

**Manual checks:**
- Install over 0.40, open one portrait PDF and one image, verify initial fit, pinch/pan bounds, page reset, and Share/Open externally.
