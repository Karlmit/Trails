---
title: 'Paste Idea cover images and close saved edits'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'oneshot'
---

<frozen-after-approval reason="human-owned intent">

## Intent

Support pasting clipboard images into the open web Idea creation/edit form using the existing photo upload and cover selection flow. Preserve ordinary text paste, upload errors, draft creation, and read-only behavior. After a successful edit save, close the editor and show the Idea card; failed saves stay open.

</frozen-after-approval>

## Implementation Notes

- Checkout reconciled with origin/main without changing file contents; published Android sources matched exactly.
- Reuse PhotoGallery multipart upload and IdeaForm lazy owner creation. Scope paste listener to the Idea form via an optional ref; display English/Swedish paste guidance only there.
- Connect IdeaCard onSaved to its existing editing state.
- Verify with typecheck, focused regression tests, and independent review. Leave changes uncommitted per workspace instructions.

- Verification: TypeScript typecheck and diff whitespace checks pass. Focused tests: 24 passed, including 8 clipboard/save regression cases. No database integration or browser run; browser connectors are offline.
- Independent blind review found no actionable issues. Confirmed Idea list selects a cover fallback when no explicit primary photo exists; existing Set as cover action remains available.
