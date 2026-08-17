-- CreateEnum
CREATE TYPE "attachment_owner_type" AS ENUM ('TIMELINE_ENTRY');

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "owner_type" "attachment_owner_type" NOT NULL,
    "owner_id" UUID NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_filename" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_trip_id_idx" ON "attachments"("trip_id");

-- CreateIndex
CREATE INDEX "attachments_owner_type_owner_id_idx" ON "attachments"("owner_type", "owner_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
