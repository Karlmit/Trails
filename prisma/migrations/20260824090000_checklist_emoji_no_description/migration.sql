-- User-requested: "Fully remove description from checklists, its not
-- needed" and "user can choose an emoji" per Checklist instead of a fixed
-- icon. Drops description outright (not just hidden from the UI) -- the
-- user was explicit this field should not exist any more.

-- AlterTable
ALTER TABLE "checklists" DROP COLUMN "description";
ALTER TABLE "checklists" ADD COLUMN "emoji" VARCHAR(16);
