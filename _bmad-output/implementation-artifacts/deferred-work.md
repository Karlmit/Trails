- source_spec: `/workspace/trails/_bmad-output/implementation-artifacts/spec-timeline-clay-and-ideas-sync.md`
  summary: Make attachment downloads size-validated and atomic, matching photo-cache repair.
  evidence: `downloadAttachment` writes directly to its destination without validating `sizeBytes`, so interrupted or truncated repairs can publish a partial file.

- source_spec: `/workspace/trails/_bmad-output/implementation-artifacts/spec-timeline-clay-and-ideas-sync.md`
  summary: Render the branded trip-cover fallback when a trip has no cover URL.
  evidence: The prior trip-list redesign only enters the hero branch when `coverImage` is nonblank, leaving blank-cover trips without the stable fallback region.

- source_spec: `/workspace/trails/_bmad-output/implementation-artifacts/spec-timeline-clay-and-ideas-sync.md`
  summary: Add real large-font, narrow-width, and RTL Compose coverage for clay list surfaces.
  evidence: Existing accessibility contract tests assert tokens and string length but do not render these configurations, so clipping and target-size regressions remain possible.
