---
title: 'Preview a blog draft before publishing'
type: 'feature'
created: '2026-11-27'
status: 'done'
route: 'dispatch'
baseline_commit: 'abfa39bd2d59f9f01707e2264b9c8078926e3663'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Blog authors need to check how their current draft reads before saving or publishing.

**Approach:** Add a read-only Preview action on Android and web which displays current unsaved title, date, text, photos, collages, and video using that platform's reader styles. Returning to editing keeps the draft and editor state.

## Boundaries & Constraints

**Always:** Preserve draft and publish behavior. Android previews use staged files and cached media offline. Use localized Swedish and English controls and an obvious return to editing.

**Never:** Create a post, save to the server, upload media, publish, or count a view as a side effect of preview. No new dependencies or backend endpoint.

</frozen-after-approval>

## Code Map

- Android `BlogEditScreen.kt` holds current view-model state and already opens staged photos in `DocumentViewerScreen`. Reuse its draft photo resolution and preview dialog. Keep edit scroll state and handle Android Back. Keep preview out of `BlogDetailViewModel` since it records views.
- Android `BlogScreens.kt` renders rich text, numbering, ordinary images, and `PhotoCollageGrid`. Extract shared reader content or share the block presentation and map current editable blocks to it using the stable app-side photo IDs. Reuse the video player for local drafts or existing authenticated media. Pending URL imports can use a labeled placeholder until available. Existing published readers must behave as before.
- Web `BlogPostForm.tsx` has the current title/date and latest serialized body in `descriptionRef` from `RichTextEditor.tsx`. Use a snapshot on opening preview and keep the original BlockNote editor mounted. Match `BlogPostDetailPanel.tsx` reader typography/width and reuse `RichTextView`, including the existing collage and video viewers. An in-page read mode is suitable and avoids an HTML modal hiding the lightbox portal. Place Preview near the start of both editors.
- Avoid changing container/app versions in implementation. Parent handles the standing request to release both.

## Tasks & Acceptance

- [x] Add the localized Android preview with original ordering, formatting, staged images, collages, title/date and playable staged/cached video.
- [x] Add the localized web preview with current unsaved content and an intact editor when closed.
- [x] Verify local draft media resolution, no preview mutations or views, and normal return and edit/save behavior.

**Acceptance criteria**
- Given unsaved text and a collage, opening Preview shows both in reading order and tapping a tile can show the original photo.
- Given a new offline Android draft, opening Preview shows staged photos without network access.
- Given a web draft, switching to preview and returning preserves the editable content and uses the existing reader rendering.
- Given preview is opened or closed, no save, publish, upload, or statistics request is made by that action.

## Implementation Notes

- Android previews use the draft's editable blocks and staged files. Uncached files for saved posts load through the authenticated media cache. The full-page dialog leaves the editor mounted.
- Web previews use the shared reader and the same mobile page padding. The original BlockNote editor stays mounted so title, body, and edit history survive the toggle.

## Spec Change Log

## Review Triage Log

- Fixed. The web toggle pauses video, waits for tracked collage uploads, and restores the editor scroll position.
- Fixed. Android resolves missing media metadata for the saved post, uses confirmed video IDs for authenticated playback, stops video when opening a photo, and shows a labeled image fallback.
- Fixed. Preview uses positions for its read-only rows and media-dialog destination so repeated block IDs do not crash preview or divert taps.
- Verified in the production web image. The mobile edit and new-post routes show current draft content without any save, upload, publish, or view request from preview. Existing guest collage filtering also passed.
- Verified with Android compile and unit tests. Local media resolution and missing metadata requests have focused coverage. This workspace has no connected Android device for interactively testing playback and navigation.

## Verification

- Typecheck, Android compile and focused unit tests.
- Exercise the web toggle in a mobile browser using an existing collage and unsaved edits with request monitoring.
- Verify the signed APK and Docker release.
