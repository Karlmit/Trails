---
title: 'Redesign the Android app with the Trails Material Clay system'
type: 'feature'
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

**Problem:** The native Android app works but its flat, web-parity styling does not express the premium, tactile travel-journal direction defined in `Clay-Design.md`, and several shared controls fall short of the new shape and touch-target standards.

**Approach:** Apply the green-and-gold Material 3 clay system throughout the Android app by evolving shared theme tokens and components first, then migrating all primary list, detail, form, navigation, and timeline surfaces while preserving their existing behavior.

## Boundaries & Constraints

**Always:** Preserve API contracts, models, navigation/back-stack behavior, localization, offline/cache behavior, callbacks, loading/empty/error states, stored section colors, timeline chronology and current-position behavior. Keep gold reserved for an active trip and today/now. Retain offline-safe bundled typography, use at least 48dp interaction targets, support long text/font scaling/RTL, and keep lazy-list effects lightweight.

**Never:** Modify the web app, backend, sync rules, or database schema; introduce network fonts; wrap each timeline row in geometry-changing decorative cards; add multi-pass blur/shadow effects to scrolling collections; use gold as a generic action or money color; remove or hide existing actions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Normal use | Populated Trips and trip-scoped screens | Warm canvas, sculpted shared surfaces, clear green hierarchy, restrained state accents, and unchanged actions/navigation | Existing screen error handling remains intact |
| Active trip / today | ACTIVE trip or current timeline date | Gold appears only on the meaningful active/now signal and remains distinguishable without color | Fall back to shape, label, and contrast—not color alone |
| Dense/offline state | Long itinerary, cached media, syncing or disconnected | Timeline remains continuous and scannable; cached images/documents and offline indicators retain current behavior | Existing loading, retry, and error states remain visible |
| Accessibility stress | Long translation, large font, narrow/RTL layout | Content wraps or reflows without clipped essential text; controls remain reachable and semantically labeled | Nonessential metadata may ellipsize only where detail recovery exists |

</frozen-after-approval>

## Code Map

- `android/app/src/main/java/com/trails/app/ui/theme/{Color,Shape,Theme,Type}.kt` -- central palette, role-based geometry, Material theme, and offline Inter typography; evolve here without touching web tokens.
- `android/app/src/main/java/com/trails/app/ui/components/{TrailsCard,PillButton,StatusBadge}.kt` -- primary migration seams for clay variants, tactile buttons, and semantic badges.
- `android/app/src/main/java/com/trails/app/ui/components/{FormFields,LabeledField,CreatableDropdownField,LinksEditor,TagsEditor}.kt` -- shared recessed-input styling and touch-target propagation.
- `android/app/src/main/java/com/trails/app/ui/triplist/TripListScreen.kt` -- representative photo-capable hero-card screen; preserve one-time active-trip auto-open, overview entry point, pull-to-refresh, and save-offline states.
- `android/app/src/main/java/com/trails/app/ui/nav/{TripDrawerScaffold,TrailsNavHost,TripTab}.kt` -- global chrome; preserve timeline-root back-stack and conditional Travel Mode rules.
- `android/app/src/main/java/com/trails/app/ui/timeline/TimelineScreen.kt` and `ui/timeline/graph/` -- hero experience; preserve continuous graph geometry, row adjacency, section transitions, date grouping, and today anchoring.
- `android/app/src/main/java/com/trails/app/ui/{ideas,checklists,budget,documents,importantinfo,blog,overview,sections,travelmode,settings,entrydetail}/` -- rollout surfaces; consolidate duplicated cards while retaining each screen’s density and interaction model.
- `android/app/src/test/java/com/trails/app/ui/triplist/TripListContentScreenshotTest.kt` -- existing deterministic visual fixture, currently ignored due Paparazzi/LayoutLib incompatibility; do not claim golden coverage.

## Tasks & Acceptance

**Execution:**
- [x] Theme and shared components -- add semantic Clay shapes/surfaces/elevation and typography roles; upgrade cards, buttons, status treatments, fields, dialogs, and minimum targets without proliferating screen-local constants.
- [x] Trips and global navigation -- implement the representative Clay hero/list treatment and cohesive drawer/top-bar/FAB chrome while retaining all routes and state actions.
- [x] Timeline -- translate the rail, grouped content, itinerary surfaces, and current marker into the restrained system without destabilizing layout or chronology.
- [x] Remaining screen families -- migrate Ideas, checklists, budget, documents/info, blog, overview, sections, travel mode, settings, and edit/detail forms through shared variants appropriate to their density.
- [x] Verification fixture and tests -- update deterministic Trip fixtures/previews where practical; compile and run unit/lint checks, documenting the existing Paparazzi blocker and manual visual checks.

**Acceptance Criteria:**
- Given any redesigned screen, when it renders, then it consistently uses warm neutrals, forest greens, 24–32dp prominent surfaces, rounded inset fields, and shared semantic components.
- Given an ACTIVE trip or today marker, when shown beside ordinary content, then gold identifies only that special state and is reinforced by text or shape.
- Given trip navigation, refresh, offline content, edits, and timeline interactions, when exercised, then all pre-redesign behavior and state feedback remain available.
- Given large text, long labels, RTL, or a narrow phone, when content lays out, then essential text and actions do not clip and interactive targets are at least 48dp.
- Given content-heavy lazy lists, when scrolled, then the design avoids repeated expensive blur/elevation animation and preserves stable timeline row geometry.

## Implementation Notes

- Added Android-only Clay palette, Material shape mapping, expanded typography, testable geometry metrics, and hero/standard/compact/tonal shared card variants.
- Updated shared buttons and form fields for tactile feedback, recessed surfaces, rounded geometry, and 48dp minimum targets.
- Applied photo-led hero treatment to Trips, coherent green navigation/FAB chrome, and an inner-ring gold today marker without changing timeline row adjacency.
- Migrated the principal list/detail families to density-appropriate shared variants while preserving their callbacks, refresh, offline, ordering, and navigation behavior.
- Added four executable design-contract tests covering every I/O matrix row. Full unit tests, debug APK assembly, lint, and diff checks pass. Paparazzi's two existing tests remain ignored because its documented LayoutLib/Compose incompatibility is unchanged; no screenshot-golden claim is made.
- Review hardening added truthful offline-cache failure propagation, stale-path clearing, atomic refresh admission/error state, cover fallbacks, non-obscuring Today markers, corrected error contrast, and focused sync plus Compose semantics regression tests.

## Spec Change Log

## Review Triage Log

- `medium` — `Theme.kt` maps `onError` to the same red as `error`; Material error-surface content can lose contrast. Direct token correction required.
- `medium` — `DocumentsRepository.ensurePhotoCached` leaves an invalid `localPath` published when repair fails; the Ideas UI can keep selecting a broken file. Clear the stale path before repair.
- `medium` — Replacing bytes at the same photo path can leave the same observable model/cache key after a failed image load. Clearing the Room path before download creates a recoverable state transition.
- `high` — Suppressed per-file cache failures allow `cachedOffline` to be set after an incomplete save. Propagate a file failure after attempting the remaining files so offline status remains truthful.
- `false` — Rejecting zero-byte or size-mismatched images is intentional integrity validation; a zero-byte file is not a usable image and server `sizeBytes` is the authoritative cache contract.
- `medium` — `TripRefresher` does not expose FAILED/CANCELLED completion, so refresh can appear successful. Preserve completion result/error state or otherwise surface failure to consumers.
- `medium` — Trip hero cover URLs can fail or be unavailable offline and currently leave an unexplained blank region. Add a stable branded fallback while retaining Coil disk caching.
- `medium` — The today ring is drawn after entry nodes at the row midpoint and can obscure a node. Draw it beneath entry nodes so chronology remains readable.
- `low` — The decorative bullet in the Today label can be announced and has brittle RTL spacing. Remove it because the bordered badge and graph ring already provide non-color cues.
- `low` — Caller-owned `clickable` modifiers can render ripple beyond a rounded `TrailsCard`; verified, but rejected here because fixing it coherently requires changing the shared card interaction API and every caller for a cosmetic edge effect.
- `medium` — `ClayDesignContractTest` validates several constants rather than rendered behavior. Add executable UI semantics coverage and retain pure contract checks only for non-renderable invariants.
- `medium` — Paparazzi remains disabled and manual large-font/RTL/device inspection was not available. Add runnable Compose semantics coverage now; pixel goldens remain honestly unclaimed pending the documented tool incompatibility.
- `medium` — Concurrent `TripRefresher.refresh` calls can race the read/write guard. Use an atomic state claim and test duplicate admission.
- `medium` — Duplicate of the stale-photo-path finding; clearing the DAO path before repair prevents broken-path publication after failure.
- `medium` — Duplicate of the trip-cover failure finding; the hero must render a branded fallback for malformed, unreachable, or offline URLs.
- `medium` — `BlogEditScreen` uses pale gold for a formatting warning, violating the approved active/today-only gold rule. Replace it with a non-gold warning surface.
- `high` — Failure-isolated `TripSyncCoordinator` sequencing, cancellation, aggregation, and offline-flag behavior have no executable regression test. Add focused tests around the real coordinator.
- `high` — Independent attachment/photo metadata synchronization has no executable regression test. Add a repository test proving photo metadata still persists after attachment failure.
- `medium` — `TripRefresher` initial-null waiting, duplicate admission, terminal failure, and cleanup behavior lack tests. Add controllable scheduler tests.
- `high` — The redesigned Trips fixture is only exercised by an ignored screenshot class. Add a runnable Compose UI test that reaches the long active cached-trip title and its Overview/refresh actions.

## Design Notes

Use one shared Clay surface model with hero, standard, compact, and tonal variants. Keep Inter because it is bundled and offline-safe. Prefer tonal fill plus one soft shadow and a subtle upper-left rim; nested information uses flat/tonal variants to avoid card-within-card noise. Trips establishes the direction, Timeline validates density, and the same primitives then carry the remaining app.

## Verification

**Commands:**
- `cd android && ./gradlew -I /tmp/trails-build-output.init.gradle.kts -Pkotlin.project.persistent.dir=/tmp/trails-kotlin-persistent :app:testDebugUnitTest :app:assembleDebug :app:lintDebug --console=plain` -- expected: compilation, unit tests, APK, and lint succeed.

**Manual checks (if no CLI):**
- Inspect Trips, Timeline, Ideas, Documents, a form, drawer, loading/empty/error/offline states, long text, and large-font layouts on a connected device or Compose preview. Paparazzi remains ignored until its LayoutLib/Compose incompatibility is resolved.
