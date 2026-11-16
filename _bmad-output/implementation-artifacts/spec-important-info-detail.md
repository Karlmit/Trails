---
title: 'Open Important Info in a detail screen'
type: 'bugfix'
created: '2026-11-16'
status: 'done'
route: 'oneshot'
---
<frozen-after-approval>
## Intent
Tapping an Android Important Info item should open a read-only detail screen showing the item and all extra information, including clickable added links. Editing should be an explicit action from that screen. Release a new Android version on GitHub for automatic updates after verification.
</frozen-after-approval>

## Implementation Notes
Use existing repositories, Compose cards and external link/file helpers. Add detail screen and ViewModel, wire list/detail/edit navigation, retain direct creation. Refresh network links/tags when returning from edit and observe item/media locally. Display optional location, contact, privacy, tags, photos and attachments. Bump Android version and use existing GitHub release workflow. No intent gaps or irreversible data changes.

## Review Triage Log
- Medium, patched: attachment caching returns null on failure; show localized feedback and cover with regression test.
- Medium, patched: unavailable photos were hidden; show named retry actions.
- Medium, patched: coordinate-only locations were omitted; show coordinates and Maps fallback.
- Low, patched: interactive photos lacked accessibility labels; use original filenames.
- Medium, patched: missing/loading item states were conflated; distinguish initial load and return to list when missing, disable editing without an item.

## Verification
- Initial compile and existing unit suite passed.
- Added regression tests for refreshing links after editing and attachment cache failure feedback.
- Concurrent verification attempts collided in Gradle test output files; rerunning the final suite sequentially.

- Final sequential unit suite passed; Kotlin compilation and diff whitespace checks passed. Device checks unavailable because Android connector is offline.
