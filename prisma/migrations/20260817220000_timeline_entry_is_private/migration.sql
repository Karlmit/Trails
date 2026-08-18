-- spec-guest-access (FR-28/AD-10): `isPrivate` defaults to `false` on every
-- existing and new TimelineEntry row (spec's Boundaries) -- a plain
-- NOT NULL DEFAULT column addition, same shape as important_info's
-- `is_private` column (20260817200000_important_info), backfills every
-- existing row to `false` for free.
-- AlterTable
ALTER TABLE "timeline_entries" ADD COLUMN "is_private" BOOLEAN NOT NULL DEFAULT false;
