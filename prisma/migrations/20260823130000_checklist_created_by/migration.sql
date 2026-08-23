-- User-clarified: a private Checklist is only visible to the User who
-- created it. No pre-existing row has a real "who created this" record,
-- so this backfills every existing Checklist to the earliest-created User
-- (arbitrary but harmless -- these are all non-private today, since
-- isPrivate itself only just shipped) before making the column required.

-- AlterTable: add nullable first (existing rows have no value yet)
ALTER TABLE "checklists" ADD COLUMN "created_by_user_id" UUID;

-- Backfill: every existing Checklist attributed to the earliest User row
UPDATE "checklists"
SET "created_by_user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
WHERE "created_by_user_id" IS NULL;

-- Now safe to require it going forward
ALTER TABLE "checklists" ALTER COLUMN "created_by_user_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "checklists_created_by_user_id_idx" ON "checklists"("created_by_user_id");
