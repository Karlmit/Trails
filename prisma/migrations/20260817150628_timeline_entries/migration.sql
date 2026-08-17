-- CreateEnum
CREATE TYPE "entry_type" AS ENUM ('STAY', 'TRANSPORT', 'ACTIVITY', 'NOTE', 'BLOG_POST');

-- CreateEnum
CREATE TYPE "entry_subtype" AS ENUM ('HOTEL', 'HOSTEL', 'RESORT', 'APARTMENT', 'VILLA', 'GUESTHOUSE', 'STAY_OTHER', 'FLIGHT', 'TRAIN', 'FERRY', 'BUS', 'CAR', 'TAXI', 'TRANSFER', 'TRANSPORT_OTHER', 'TOUR', 'RESTAURANT', 'ATTRACTION', 'EVENT', 'BEACH', 'HIKE', 'MUSEUM', 'SHOPPING', 'NIGHTLIFE', 'ACTIVITY_OTHER');

-- CreateTable
CREATE TABLE "timeline_entries" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "entry_type" "entry_type" NOT NULL,
    "subtype" "entry_subtype",
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6),
    "location_name" TEXT,
    "location_address" TEXT,
    "location_lat" DECIMAL(9,6),
    "location_lng" DECIMAL(9,6),
    "location_map_link" TEXT,
    "booking_reference" TEXT,
    "expense_amount" DECIMAL(12,2),
    "expense_currency" TEXT,
    "expense_payment_status" TEXT,
    "expense_payment_note" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "notes" TEXT,
    "post_trip_notes" TEXT,
    "type_details" JSONB NOT NULL DEFAULT '{}',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timeline_entries_trip_id_start_at_idx" ON "timeline_entries"("trip_id", "start_at");

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
