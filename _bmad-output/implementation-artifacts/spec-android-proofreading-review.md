---
title: 'Improve Android proofreading and add optional ChatGPT'
type: 'bugfix'
created: '2026-11-28'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Swedish proofreading can suggest unnecessary rewrites, and in-word strikeouts make it hard to read what Replace will apply.

**Approach:** Render the exact proposed paragraph with subtle highlights. Keep the original separately available for comparison. Add Swedish minimal-edit examples to the existing local prompt. Keep local proofreading as the default. Add a ChatGPT toggle and user-supplied OpenAI key in Android settings.

</frozen-after-approval>

## Implementation Notes

- Both providers use the same correction validation and show a preview before changing the draft.
- ChatGPT uses the OpenAI Responses API with structured output. Each request includes only the paragraph chosen by the user. The key is entered in Android settings and encrypted with Android Keystore, with ciphertext excluded from backups.
- The settings screen states that cloud proofreading sends the paragraph to OpenAI and uses the user's API credits or billing.

## Review Triage Log

- The preview now indicates when text was removed and scrolls to the original section when requested. UI tests cover the corrected text and original comparison.
- Local output token budgeting now uses source length rather than counting prompt examples against the output allowance.
- Key writes sync the ciphertext before atomically replacing the previous file. Storage errors reach Settings, which keeps the entered key available for retry.
- The provider setting is excluded from backup and device transfer so a restored app starts with local proofreading available.
- An unreadable local key has its own error message. OpenAI key rejections, usage limits, and connection failures also have dedicated messages.
- Provider tests cover local routing, cloud routing, missing credentials, cancellation, and simulated HTTP failures and responses. The existing release workflow builds the signed APK. The Android unit suite runs before pushing the release commit.
- A physical OnePlus and live OpenAI credentials were unavailable. Model output quality and device Keystore behavior were not exercised on hardware.
