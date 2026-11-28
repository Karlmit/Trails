---
title: 'Place timeline section labels on their start dates'
type: 'bugfix'
created: '2026-11-28'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

Show each section label in the row for its start date on the website and Android. Right-align a single label within the day's content column. On a shared start date, show the section that ends first on the left and the next section on the right. This places a one-day section before a longer section starting on the same day.

</frozen-after-approval>

## Implementation Notes

- Determine section label dates directly from section starts. Day bands still use inclusive section membership.
- When more than two sections start on the same day, continue in left-right pairs. An unpaired last label sits on the right.
- Sections that started before a shortened trip retain their label on the first visible day, provided they still cover that day.
- Android measures the label strip in the drawing phase to offset dots. The web reserves an equal amount of space in the desktop entry-dot column. Mobile web labels can wrap.

## Review Triage Log

- Fixed the missing first-visible label for an older section that still overlaps the trip.
- Fixed Android dot placement to account for the measured label strip.
- Verified same-day ordering in both layout engines. The browser test exercised actual timeline rows at widths of 320, 390, 640, and 1280 pixels with no horizontal overflow or label overlap.
