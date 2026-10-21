---
title: 'Polish Idea viewing and move Save into the app bar'
type: 'feature'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7a61bfcaf7963b34af078961737469c1babe087e'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Editing an Idea lacks the expected upper-right Save action, while the read-only Idea screen gives the title card more visual weight than the destination photo and repeats a small image in a separate Photos card.

**Approach:** Put Save in the edit app bar and redesign Idea detail as a calm, image-led mobile page: a large cover hero first, followed by a clear title/status/details hierarchy and only genuinely additional photos below.

## Boundaries & Constraints

**Always:** Use the primary Idea photo as cover, falling back to the newest valid cached photo; collapse the hero completely when no usable image exists. Show the complete title in content even when long, preserve category, description, priority, weather, section, location/maps, estimated cost, links, conversion, error/loading behavior, edit navigation, and Swedish/English localization. Disable Save while saving and use the same `IdeaEditViewModel` instance in app-bar and form.

**Never:** Show an empty hero placeholder, duplicate the cover as the only photo in a separate gallery, hide validation/network errors, change create/convert/delete semantics, navigate away merely because Save succeeded, crop text, add fixed-width phone-only layout, or regress image cache validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Detail with cover | Primary or newest-fallback valid local photo | Large cropped hero leads the page; remaining content follows with strong hierarchy | Coil failure does not block details |
| Detail without cover | No photo or unusable cached path | Content begins directly with title/details; no blank image box | Existing sync/cache behavior remains unchanged |
| Photo gallery | One cover / cover plus additional photos | Cover-only gallery is omitted; additional photos remain available below | Missing local paths are skipped |
| Edit idle/saving | Existing, new, or converting Idea | Upper-right localized Save triggers `save`; action disables and shows progress while saving | Existing banner and auto-scroll expose validation/network failure |
| Stress layout | Long title, Swedish labels, large font, narrow screen | App-bar actions remain reachable and full title wraps in content | No clipping or overlap |

</frozen-after-approval>

## Code Map

- `android/app/src/main/java/com/trails/app/ui/nav/TrailsNavHost.kt` -- owns Idea detail/edit app bars; detail currently uses the full title and Edit icon, edit has no action. Follow the existing Checklist edit pattern by lifting the Idea edit VM/state into the destination.
- `android/app/src/main/java/com/trails/app/ui/ideas/IdeaEditScreen.kt` -- long form with an in-card Save/Create/Convert button; remove that duplicate while preserving progress/errors and all resource editing.
- `android/app/src/main/java/com/trails/app/ui/ideas/IdeaDetailScreen.kt` -- current stacked cards and 88dp gallery; rebuild hierarchy around a cover hero and additional-photo gallery.
- `android/app/src/main/java/com/trails/app/data/DocumentsRepository.kt` -- reuse `selectIdeaCoverPhotos` and `isUsablePhotoCache` semantics rather than inventing cover precedence.
- `android/app/src/test/java/com/trails/app/ui/ideas/` and navigation tests -- add focused Compose/pure coverage for hero present/absent, cover exclusion, long titles, and app-bar Save idle/saving behavior.
- `android/app/build.gradle.kts` -- bump Android release to 0.43.0 / code 43.

## Tasks & Acceptance

**Execution:**
- [x] `TrailsNavHost.kt` and `IdeaEditScreen.kt` -- add the upper-right Save action backed by shared state; remove the in-card duplicate.
- [x] `IdeaDetailScreen.kt` -- implement the image-led responsive detail hierarchy and valid-cover/additional-photo selection.
- [x] Idea UI tests -- verify Save interaction/state and hero/gallery/no-image/long-title behavior.
- [x] `build.gradle.kts` -- prepare Android 0.43.0.
- [x] Release -- run tests, Android-test compilation, signed assembly and lint; review, push, and publish the signed APK.

**Acceptance Criteria:**
- Given any Idea edit route, when displayed, then a localized Save action appears upper-right, invokes the active form VM once, and cannot be repeatedly tapped while saving.
- Given an Idea with a usable cover, when viewed, then that image is the dominant first content block and its title/status/details are readable immediately below.
- Given no usable cover or only one photo, when viewed, then the layout collapses cleanly without empty or duplicate photo sections.

## Implementation Notes

Implemented a stable short Idea app-bar title, a validated primary/newest 16:10 hero, additional-photo de-duplication and on-demand cache repair, a 720dp reading column, and wrapped metadata/title content. Idea Save now lives in the app bar, shares the form ViewModel, remains localized and accessible during progress, waits for initialization, and guards duplicate submissions. The complete 108-task signed build and lint pipeline passed after review fixes.

## Spec Change Log

## Review Triage Log

| Source | Verdict | Route | Evidence |
|---|---|---|---|
| blind: Save enabled before existing Idea initialization | high | patch | Existing edit state begins blank until `loadIfEditing`; an immediate app-bar tap can surface false validation and must be disabled until initialized. |
| blind/edge: duplicate saves before recomposition | high | patch | UI disabling is asynchronous and `save()` lacks an in-flight guard, so rapid taps can launch duplicate mutations. |
| blind: file validation repeats during composition | medium | patch | `selectIdeaDetailPhotos` performs filesystem checks from recomposition; memoize the derived result by photo list to avoid repeated main-thread work. |
| blind: non-cover server photos may remain uncached | medium | patch | Trip sync deliberately downloads only selected covers, so detail must request cache repair for its owner photos before promising an additional-photo gallery. |
| blind: saving spinner loses accessible Save name | medium | patch | Replacing text with an unlabeled indicator removes the action's stable accessible name; retain localized semantics during progress. |
| blind/edge: metadata separators can wrap alone | medium | patch | Independent middle-dot children can strand punctuation on narrow/large-font layouts; make metadata self-contained wrapping items. |
| blind: long-title test only checks semantics text | medium | patch | Full semantics text does not prove visual wrapping; add bounded-width layout evidence or screen-level coverage. |
| blind: Save test hard-codes English | low | patch | The test depends on ambient locale despite localized production resources; resolve the expected string from resources. |
| blind/verification/edge: detail rendering not tested | medium | patch | Selector-only tests remain green if hero/title/gallery calls are removed; add controlled content-level Compose tests for hero/no-hero/gallery/long-title. |
| blind/verification: app-bar and form VM wiring not tested | medium | patch | Isolated callback tests cannot detect destination miswiring; extract/test a destination seam or add navigation-level coverage for shared state and callback. |
| verification: both edit destinations lack integration coverage | medium | patch | Normal and convert routes are the sole Save surfaces after removing the form button; cover both route configurations through the shared destination seam. |
| verification: stable app-bar/full content title split untested | medium | patch | An isolated `IdeaTitle` test cannot detect restoring a long app-bar title; assert the short shell title and full content title at destination/content level. |

## Design Notes

Use the `improve` posture with calm guidance: one dominant 16:10-style hero inside the scroll content, rounded with the existing clay shape language; title and compact priority/weather/section metadata beneath; fewer, stronger surfaces rather than a card for every field. Keep the app-bar title stable and short (`Idea`/`Idé`) so back, Edit, and Save remain usable with long user content. On wide screens, constrain the reading column rather than stretching photography and prose indefinitely.

## Verification

**Commands:**
- `cd android && ./gradlew -I /tmp/trails-build-output.init.gradle.kts -Pkotlin.project.persistent.dir=/tmp/trails-v043-kotlin :app:testDebugUnitTest :app:compileDebugAndroidTestKotlin :app:assembleRelease :app:lintDebug --console=plain` -- UI/unit tests, Android-test compilation, signed APK, and lint succeed.

**Manual checks:**
- Install over 0.42; inspect one Idea with a URL-imported cover, one without a photo, and one with multiple photos; edit/save with Swedish locale and confirm long-title/large-font behavior.
