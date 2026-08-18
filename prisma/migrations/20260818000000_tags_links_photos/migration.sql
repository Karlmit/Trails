-- spec-tags-links-photos, AD-4: renames the existing attachment_owner_type
-- enum (created in 20260817193516_attachments) to the shape-neutral name
-- polymorphic_owner_type and adds IDEA as a new member, then reuses it as
-- the owner_type column type on Tag/Link/Photo below, alongside Attachment.
-- Safe/additive: RENAME touches no existing value, and ADD VALUE below is
-- never *used* (no DML referencing 'IDEA') in this same transaction, so
-- Postgres's "unsafe use of new enum value in the same transaction it was
-- added" restriction never applies here (same verified pattern as
-- 20260817200000_important_info's ADD VALUE 'IMPORTANT_INFO').
ALTER TYPE "attachment_owner_type" RENAME TO "polymorphic_owner_type";
ALTER TYPE "polymorphic_owner_type" ADD VALUE 'IDEA';

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "owner_type" "polymorphic_owner_type" NOT NULL,
    "owner_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tags_owner_type_owner_id_idx" ON "tags"("owner_type", "owner_id");

-- CreateTable
CREATE TABLE "links" (
    "id" UUID NOT NULL,
    "owner_type" "polymorphic_owner_type" NOT NULL,
    "owner_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "links_owner_type_owner_id_idx" ON "links"("owner_type", "owner_id");

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "owner_type" "polymorphic_owner_type" NOT NULL,
    "owner_id" UUID NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_filename" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photos_trip_id_idx" ON "photos"("trip_id");

-- CreateIndex
CREATE INDEX "photos_owner_type_owner_id_idx" ON "photos"("owner_type", "owner_id");

-- AD-4's literal rule: "at most one is_primary = true row per
-- (owner_type, owner_id)". Not representable in Prisma's schema language
-- (see prisma/schema.prisma's Photo model comment) -- a partial unique
-- index, authoritative here, same documented-raw-SQL pattern as AD-2's
-- EXCLUDE constraint in 20260817131140_init/migration.sql. Only rows with
-- is_primary = true participate, so any number of non-primary Photos per
-- owner is unaffected.
CREATE UNIQUE INDEX "photos_one_primary_per_owner" ON "photos"("owner_type", "owner_id") WHERE "is_primary" = true;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
