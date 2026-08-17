-- AlterEnum
-- FR-26, spec-important-info: extends the existing attachment_owner_type
-- enum (created in 20260817193516_attachments) with a second member. This
-- migration file adds the value only -- nothing in this same file (or this
-- same transaction) ever *uses* 'IMPORTANT_INFO' in an expression (no
-- column DEFAULT, no DML), so Postgres's "unsafe use of new value" rule
-- (new enum values can't be referenced in the same transaction that adds
-- them) never applies here. The CREATE TABLE below stores no
-- attachment_owner_type column at all -- it's a plain new table, unrelated
-- to this enum change except by being deployed in the same migration step.
-- `prisma migrate deploy` runs each migration.sql in one transaction by
-- default; verified this applies cleanly in one step against a live
-- Postgres 18 (no two-migration split needed).
ALTER TYPE "attachment_owner_type" ADD VALUE 'IMPORTANT_INFO';

-- CreateTable
CREATE TABLE "important_info" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "location_name" TEXT,
    "location_address" TEXT,
    "location_lat" DECIMAL(9,6),
    "location_lng" DECIMAL(9,6),
    "location_map_link" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "important_info_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "important_info_trip_id_idx" ON "important_info"("trip_id");

-- AddForeignKey
ALTER TABLE "important_info" ADD CONSTRAINT "important_info_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
