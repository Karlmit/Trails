-- spec-entry-fields-datepickers: new, additive TimelineEntry columns
-- alongside booking_reference -- a venue/booking's own website and how it
-- was booked (e.g. "Booking.com"). Both nullable, no default, no backfill
-- needed for existing rows.
ALTER TABLE "timeline_entries" ADD COLUMN "website" TEXT;
ALTER TABLE "timeline_entries" ADD COLUMN "booked_via" TEXT;
