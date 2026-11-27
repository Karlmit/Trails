---
title: 'Square photo collages in blog posts'
type: 'feature'
created: '2026-11-27'
status: 'done'
route: 'dispatch'
baseline_commit: '49e2e71485161eb90a6244be7157c9325c601400'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Blog authors can display photos as individual images but need an option to present a group as a square photo wall.

**Approach:** Add a distinct photo collage element to the Android and web blog editors. Keep the ordinary media insert as the default. Show the collage in both readers and allow opening individual photos in the existing viewers.

## Boundaries & Constraints

**Always:** Keep the original photos and normal media/upload behavior. Android collages must work in local drafts and use existing background, resumable uploads. Persist in the existing BlockNote description without a migration. Older app versions and an older server must still render individual photos from newly created collages.

**Never:** Flatten photos into a rendered bitmap or introduce a second upload API. Videos remain separate blocks.

</frozen-after-approval>

## Code Map

- `components/RichTextEditor.tsx` owns the web BlockNote schema, upload adapter, toolbar, slash menu, and read-only editor. Reuse `editor.uploadFile` and web translations. Reuse `BlogMediaLightbox` or its existing viewer dependency for full-size tiles.
- Android `ui/blog/EditableBlocks.kt` and `BlogBlocks.kt` map BlockNote JSON. `BlogEditScreen.kt` and `BlogEditViewModel.kt` own the picker, local staging, and reorderable rows. `BlogPublisher.kt` owns upload progress, retries, and rewriting photo IDs. `BlogScreens.kt` opens the existing photo viewer.

## Tasks & Acceptance

**Execution:**
- [x] Implement storage and matching square grids in both clients.
- [x] Add web and Android controls with Swedish and English labels. Allow adding photos and removing individual photos from a collage. Support normal block placement, reorder and removal.
- [x] Verify old content, round-trip of the new element, and individual original photo links. Add focused tests for serialization and layout.

**Acceptance Criteria:**
- Given an author inserts ordinary media, layout stays unchanged.
- Given an author creates a collage with two or more photos, it renders as a responsive 1:1 group in each reader and each tile opens the original photo. Limit picker additions to nine photos per collage and communicate the capacity.
- Given a collage is drafted offline on Android, reopening and publishing retain all selected photos and their order. Retrying a failed publish reuses confirmed uploads per photo.
- Given a collage is opened by an older Android or web reader, its original photos appear in sequence.

## Design Notes

Persist the group as a known `layoutImage` with `props: { collage: true }`, an empty URL, and ordinary `layoutImage` children with photo URLs. Older clients already traverse children. On Android use one editable block containing image items with stable IDs. On web, project the persisted group into a custom `photoCollage` BlockNote block with a string prop encoding the children and convert it back on save. Only project groups with valid still-photo children so interrupted or unusual nested content remains visible. An empty or singleton editor collage can be persisted safely, with readers showing zero or one ordinary photo. Use equal-height rows and equal-width cells per row, matching row sizes across clients. A practical arrangement for counts 1–9 is [1], [1,1], [1,2], [2,2], [2,3], [2,2,2], [2,2,3], [2,3,3], [3,3,3]. Use center-cropped previews and original media in viewers.

## Implementation Notes

- Verified the saved description in the previous Docker release and in the previous Android reader and editor parsers compiled directly from the baseline. Both clients preserved the original inline image and every collage tile in order.
- Verified the production web build at a 390 px mobile viewport. The fixture grid measured 354 × 354 px, and a second-row tile opened its original in the existing lightbox.
- Browser tests covered toolbar and slash insertion, real multi-photo uploads, tile removal, moving and saving a collage, and preventing submission while an upload was delayed. The Android tests cover local draft reload and reuse of confirmed photos on publish retry.

## Spec Change Log

## Review Triage Log

- Fixed. Android uses remaining capacity for valid selections and reports excess items. The fallback picker may supply its own order, which the editor retains.
- Fixed. A restored Android picker result waits for the local draft to load.
- Fixed. Android checks local collage files, repairs stale paths, and loads large collage photos on demand. Unresolved photos display a label and wait for metadata before opening.
- Fixed. The guest web reader filters collage tiles against the authorized photo list. The editor and signed-in reader retain every photo.
- Fixed. The web editor guards selected collage blocks from text formatting and locks edits during Save.
- Low. Explicit BlockNote delete or undo can remove a group during an upload. The uploaded file still belongs to the post, and no automatic cleanup deletes user media.
- Deferred. Ordinary media and attachments already share owner creation separately from Save. The new collage batch and Save are mutually exclusive, and the older paths retain their behavior.
- Low. Text accidentally nested beneath the media-only block is persisted immediately after the collage in order. Browser editing retains the text.
- Low. Duplicate tile IDs within a group would require malformed external data. Both editors generate stable, unique tile IDs for normal operations.
- Low. Existing image blocks have no inline content by schema. A malformed image wrapper carrying text was unsupported before the change.
- Verified. The production browser workflow tested cross-client serialization and both insertion controls, Save with a delayed upload, tile removal, block ordering, square size, and opening a second-row original.
- Verified. The baseline APK source parsers and previous server both read the real stored fixture as ordered image blocks.
- Fixed. Android tests drive the collage detail cache and mixed-media staging to catch missing prefetch and rejecting a video without losing following photos.

## Verification

- Run npm typecheck and focused rich-text/collage tests.
- Build Android and run focused collage and upload-related tests.
- Verify the web view on a mobile viewport and validate both release channels.
