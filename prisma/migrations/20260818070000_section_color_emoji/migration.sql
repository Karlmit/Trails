-- spec-sections-color-emoji: two nullable columns on Section. Plain TEXT,
-- not an enum -- the curated allowed-value sets (SECTION_COLOR_PALETTE /
-- SECTION_EMOJI_OPTIONS, lib/section-colors.ts) are enforced in
-- lib/validation.ts, the same "curated set, not a DB constraint"
-- enforcement point used elsewhere in this codebase. Both default to NULL
-- (no DEFAULT clause needed -- ADD COLUMN with no NOT NULL already leaves
-- every existing row NULL), so existing Sections keep rendering via the
-- pre-existing auto-cycled fallback with no backfill required.
ALTER TABLE "sections" ADD COLUMN "color" TEXT;
ALTER TABLE "sections" ADD COLUMN "emoji" TEXT;
