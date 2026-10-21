---
title: 'Render sharp PDF pages while zooming'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '30ed69012a71ca22919b2cf4b0edbc5c1f94f87a'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** PDF pages become visibly blurry when the user zooms because Trails rasterizes each page once at the PDF's low logical point dimensions and then enlarges those pixels with a display transform.

**Approach:** Rasterize PDF pages at a substantially higher density suitable for the viewer's 5× zoom range while retaining strict dimension and pixel caps so quality improves without unbounded memory use.

## Boundaries & Constraints

**Always:** Preserve the current fit-to-screen, pinch/pan, page navigation, retry, Share, and Open externally behavior. Render only one PDF page at a time, keep allocation bounded, recycle replaced pages, preserve page aspect ratio, and perform rendering off the main thread.

**Never:** Allocate an uncapped bitmap, render all pages eagerly, degrade image viewing, remove the 5× zoom range, add storage permissions, or allow a quality upgrade to flash an empty viewer during ordinary interaction.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Typical PDF | Standard portrait/landscape PDF page | Bitmap dimensions are multiplied above logical PDF point dimensions and remain aspect-correct | Existing retry state handles render failure |
| Large/extreme page | Source would exceed memory/dimension limits | Target is scaled down within both limits while retaining aspect ratio | No oversized allocation or crash |
| Zoom | User pinches up to 5× | Text and line work remain materially sharper than 0.41's logical-size raster | Existing bounded transform remains responsive |
| Page change | User selects next/previous page | Previous bitmap is recycled and only the selected page is retained | Existing page reset/error behavior remains |

</frozen-after-approval>

## Code Map

- `android/app/src/main/java/com/trails/app/ui/documents/DocumentViewerScreen.kt` -- `renderPdfPage` currently renders at `boundedPdfBitmapSize`; that helper clamps scale to at most 1× logical page size, while `ZoomableDocumentViewport` magnifies the resulting pixels to 5×.
- `android/app/src/test/java/com/trails/app/ui/documents/DocumentViewerTest.kt` -- extend pure size-policy coverage for upscaling, aspect preservation, dimension/pixel caps, and invalid dimensions.
- `android/app/src/androidTest/java/com/trails/app/ui/documents/PdfRendererInstrumentedTest.kt` -- platform renderer contract; assert the generated PDF is rasterized above logical dimensions and remains caller-owned/recyclable.
- `android/app/build.gradle.kts` -- bump the corrected release to Android 0.42.0 / code 42.

## Tasks & Acceptance

**Execution:**
- [x] `DocumentViewerScreen.kt` -- replace the 1× logical-size policy with a high-density, bounded target and retain single-page ownership/recycling.
- [x] PDF JVM/instrumentation tests -- prove meaningful upscaling, aspect preservation, both caps, invalid-input handling, and platform output dimensions.
- [x] `build.gradle.kts` -- prepare Android 0.42.0.
- [x] Release -- run unit tests, Android-test compilation, signed release assembly and lint; review, push, and publish the signed GitHub APK.

**Acceptance Criteria:**
- Given the same standard PDF used in 0.41, when opened and zoomed, then the page uses a multi-density raster rather than stretching a logical-size bitmap and fine text is materially sharper.
- Given any valid page dimensions, when a render size is selected, then neither configured dimension nor pixel budget is exceeded and the aspect ratio is preserved within integer rounding.
- Given page navigation and zoom gestures, when used after the change, then the existing interaction behavior and one-page memory lifecycle remain intact.

## Implementation Notes

- PDF pages now target a 5× raster, bounded to 4096 pixels per side and 12 million pixels total. Size calculations use `Double` so extreme integer dimensions cannot overflow the pixel-budget calculation, and failed renders recycle their allocation before rethrowing.
- Render failures recycle their newly allocated bitmap before propagating the error. Page lifecycle coverage verifies both replacement and final-viewer-disposal recycling while successful renders remain caller-owned.

## Spec Change Log

- 2026-10-21: Implemented bounded high-density PDF rendering, coverage for the size policy and page lifecycle, and the Android 0.42.0 version bump.

## Review Triage Log

| Source | Verdict | Route | Evidence |
|---|---|---|---|
| blind/edge: render failure leaks allocated bitmap | high | patch | `Bitmap.createBitmap` succeeds before `page.render`; an exception exits without deterministic recycling and retry can repeat a roughly 48 MB allocation. |
| blind: 12 MP budget may be unsafe on low-memory devices | maybe-false | defer | The cap is bounded and intentional, but device-specific heap/GPU duplication is not measurable without low-memory device profiling; that profiling would settle the risk. |
| blind: 4× source under a 5× zoom ceiling | medium | patch | A typical page remains interpolated at maximum zoom even before caps apply; using the existing budget with a 5× target directly aligns the source goal with the viewer limit. |
| blind: reported invoice visual comparison not recorded | maybe-false | defer | The invoice exists on the user's phone and is not available in the repository; installation and comparison on that device is required to settle perceived fine-text quality. |
| blind: instrumentation test does not exercise capped-size platform renders | low | reject | Cap arithmetic is exhaustively covered in JVM tests; allocating near-48 MB test pages on every instrumentation run adds device instability without checking different production logic. |
| blind: final bitmap disposal not asserted | medium | patch | Page replacement is tested, but removal of the viewer could stop recycling the currently displayed high-density page without failing the suite. Add deterministic composition-removal coverage. |
| edge: lifecycle test list is mutated across threads unsafely | medium | patch | The injected renderer runs on `Dispatchers.IO` while Compose test assertions read a mutable list, creating a real data race. Use a synchronized collection. |
| verification: platform renderer test compiled but not executed | medium | defer | No Android device or managed emulator is installed in this workspace; execute the existing test on a device/CI emulator to verify the platform integration path. |

## Design Notes

Use a high-density full-page raster rather than rerendering continuously during pinch. This keeps gesture feedback stable and the lifecycle simple. A target of 5× logical PDF dimensions, capped around 4096 pixels per side and 12 million pixels total, aligns with maximum viewer zoom while keeping a single ARGB page under roughly 48 MB. Apply the scale before both caps; do not retain the old `coerceAtMost(1f)` behavior.

## Verification

**Commands:**
- `cd android && ./gradlew -I /tmp/trails-build-output.init.gradle.kts -Pkotlin.project.persistent.dir=/tmp/trails-v042-kotlin :app:testDebugUnitTest :app:compileDebugAndroidTestKotlin :app:assembleRelease :app:lintDebug --console=plain` -- tests, Android-test compilation, signed APK, and lint succeed.
- Result: `BUILD SUCCESSFUL` across 108 tasks after applying the review fixes and local release signing configuration.

**Manual checks:**
- Install over 0.41 and compare fine text at fit, 2×, and maximum zoom on the reported invoice PDF; confirm page changes still reset and do not accumulate memory.
