- source_spec: `/workspace/trails/_bmad-output/implementation-artifacts/spec-timeline-clay-and-ideas-sync.md`
  summary: Make attachment downloads size-validated and atomic, matching photo-cache repair.
  evidence: `downloadAttachment` writes directly to its destination without validating `sizeBytes`, so interrupted or truncated repairs can publish a partial file.

- source_spec: `/workspace/trails/_bmad-output/implementation-artifacts/spec-timeline-clay-and-ideas-sync.md`
  summary: Render the branded trip-cover fallback when a trip has no cover URL.
  evidence: The prior trip-list redesign only enters the hero branch when `coverImage` is nonblank, leaving blank-cover trips without the stable fallback region.

- source_spec: `/workspace/trails/_bmad-output/implementation-artifacts/spec-timeline-clay-and-ideas-sync.md`
  summary: Add real large-font, narrow-width, and RTL Compose coverage for clay list surfaces.
  evidence: Existing accessibility contract tests assert tokens and string length but do not render these configurations, so clipping and target-size regressions remain possible.
- source_spec: `/tmp/trails-v042-work-O9y2JE/_bmad-output/implementation-artifacts/spec-pdf-zoom-render-quality.md`
  summary: Profile the high-density PDF bitmap budget on a representative low-memory Android device.
  evidence: The 12 MP cap is explicit and bounded, but device heap and GPU-copy behavior must be measured to determine whether the roughly 48 MB page causes pressure.
- source_spec: `/tmp/trails-v042-work-O9y2JE/_bmad-output/implementation-artifacts/spec-pdf-zoom-render-quality.md`
  summary: Compare fine PDF text on the user's reported invoice before and after 0.42.
  evidence: The invoice is available on the user's phone but not in this repository, so only device installation can settle perceived fine-text quality at each zoom level.
- source_spec: `/tmp/trails-v042-work-O9y2JE/_bmad-output/implementation-artifacts/spec-pdf-zoom-render-quality.md`
  summary: Execute the platform PdfRenderer instrumentation test on an Android device or managed emulator.
  evidence: This workspace has ADB but no attached device or installed managed emulator; execution would verify the real platform renderer rather than only compiling the test.
