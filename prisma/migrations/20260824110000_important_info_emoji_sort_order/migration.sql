-- User-requested: a free-text emoji (same pattern as Checklist.emoji) and a
-- manually-reorderable position for Important Info items.

-- AlterTable
ALTER TABLE "important_info" ADD COLUMN "emoji" VARCHAR(16);
ALTER TABLE "important_info" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
