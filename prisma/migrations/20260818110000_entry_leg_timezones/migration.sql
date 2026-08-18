-- spec-timeline-ux-and-timezone (correction): new, additive TimelineEntry
-- columns -- a traveler-declared real IANA timezone for one leg of a
-- Transport Entry (departure/arrival airports in different real zones).
-- Both nullable, no default, no backfill needed for existing rows: NULL
-- means "literal digits, no real timezone attached," the existing and only
-- behavior for every row created before this migration.
ALTER TABLE "timeline_entries" ADD COLUMN "start_timezone" TEXT;
ALTER TABLE "timeline_entries" ADD COLUMN "end_timezone" TEXT;
