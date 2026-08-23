-- User-requested: "Checklists can be marked as private or shared with
-- other trip users." Same shape as important_info's `is_private` column
-- (20260817200000_important_info) and timeline_entries'
-- (20260817220000_timeline_entry_is_private) -- a plain NOT NULL DEFAULT
-- column addition, backfills every existing row to `false` for free.
-- AlterTable
ALTER TABLE "checklists" ADD COLUMN "is_private" BOOLEAN NOT NULL DEFAULT false;
