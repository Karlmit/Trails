-- User-requested: an optional free-text Description field, and dropping the
-- weatherTags free-text field entirely (redundant with weatherSuitability).

-- AlterTable
ALTER TABLE "ideas" ADD COLUMN "description" TEXT;
ALTER TABLE "ideas" DROP COLUMN "weather_tags";
