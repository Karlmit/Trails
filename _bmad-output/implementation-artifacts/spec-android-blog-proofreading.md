---
title: 'Proofread a blog paragraph on Android'
type: 'feature'
created: '2026-11-28'
status: 'done'
route: 'dispatch'
baseline_commit: '676af5a68c34981cd28b8177b13aa03b42c9fad7'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Android blog authors want to correct an individual text block from the editor, including Swedish travel prose, with on-device AI.

**Approach:** Add a proofreading action per nonempty text block. Show a Trails-styled bottom sheet with a scrollable suggestion, highlighted corrections, and explicit Insert and Replace actions. Dismiss keeps the original text.

## Boundaries & Constraints

**Always:** Run inference through Android AICore locally. Check runtime availability and offer an explicit model download when available. Correction prompts preserve the input language, voice, proper names, and meaning. Copy or apply only on explicit user action. Keep neighboring blocks and media order, block kind, and formatting of unchanged text when replacing. Local draft behavior continues to work.

**Never:** Send draft text to Trails, a cloud AI endpoint, a third-party app, or logs. Use a private OnePlus interface or present the feature as OnePlus AI Writer. Never overwrite a block that changed after the suggestion was generated.

</frozen-after-approval>

## Code Map

- `android/app/src/main/java/com/trails/app/ui/blog/BlogEditScreen.kt` renders each TextBlockEditor. Use its existing text styling action row or a compact contextual affordance. Open a localized Compose Material 3 sheet using Trails theme colors and shapes. Prioritize readable multiline text, close, and accessible actions. Match the reference's hierarchy without copying OnePlus branding.
- `BlogEditViewModel.kt` owns ordered blocks and device-draft persistence via edit(). Apply Insert/Replace atomically against the captured source. Preserve existing editing/publish behavior and do not publish.
- `EditableBlocks.kt` defines Text and InlineRun. `RichTextField.kt` has style helpers. Use a bounded diff to map unchanged formatting and highlight edits in the corrected text. Cover long and stale inputs, changed/no-change results, replace and insert ordering in focused tests.
- Use published Google ML Kit `com.google.mlkit:genai-prompt:1.0.0-beta4` on the existing Kotlin 2.2.21/Coroutines 1.11 toolchain if compatible. Beta5 POM needs Kotlin 2.4 and should not trigger an unrelated upgrade. Beta4 fixes non-Pixel status and uses coroutines 1.11 for download. Prefer stable default `Generation.getClient()` with `checkStatus()`. For DOWNLOADABLE offer model download, DOWNLOADING show status/recheck, UNAVAILABLE show device/setup message. Close resources and propagate coroutine cancellation. Treat input as quoted text, require a correction-only response in its input language, bound input/output and avoid applying malformed/empty results.
- Sources: developers.google.com/ml-kit/genai/, developers.google.com/ml-kit/genai/prompt/android/get-started, developers.google.com/ml-kit/genai/proofreading/android, developers.google.com/ml-kit/known-issues. Google lists OnePlus 15 but has no Swedish guarantee for direct Nano inference. Do not claim physical-device confirmation.
- Localized Swedish and English via values/values-en. Parent owns version bump and publication.

## Tasks & Acceptance

- [x] Implement AICore model availability, setup and local paragraph proofreading.
- [x] Add localized proofreading preview and safe draft application.
- [x] Verify targeted output/diff and editor mutation tests, debug/release builds.

**Acceptance criteria**
- Given AICore is ready, a text block produces a suggestion preview with changes highlighted. Insert creates a corrected block immediately after the original. Replace changes only the current block.
- Given the model needs setup or no correction is available, the author sees an actionable state and the text remains unchanged.
- Given the model is ready and the device has no internet, proofread inference remains on the device.

## Implementation Notes

- Uses stable on-device Gemini Nano through ML Kit direct model access. OnePlus publishes AI Writer as an OxygenOS feature. I found no documented public OnePlus SDK for invoking it from Trails.
- Google lists OnePlus 15 as supporting direct access. Its dedicated proofreading API omits Swedish, so Trails uses an original-language prompt. Device and language results remain dependent on the installed AICore model.
- A model download is started only after consent. The suggestion preserves editable blocks and uses the existing local draft write path.


## Review Triage Log

- Covered consent, resource cleanup, inference failure after a completed download, too-long output and line-break preservation with runtime SDK doubles.
- Covered styled word alignment, highlighted corrections, and stale or dismissed requests with draft and diff tests. Replacement previews show the removed text, also available to TalkBack.
- Verified Insert and Replace controls in a Robolectric sheet fixture with synthetic Swedish text. No physical OnePlus was connected for verifying actual suggestions or first-time setup.
- The bounded diff aligns Unicode code points. Visual styling of unusual grapheme sequences can still differ where characters inside a sequence change.
