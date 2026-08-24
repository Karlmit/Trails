-- User-requested: a manual override so a Trip can be marked ACTIVE
-- regardless of its dates -- see lib/trip-status.ts's computeTripStatus.

-- AlterTable
ALTER TABLE "trips" ADD COLUMN "pinned_active" BOOLEAN NOT NULL DEFAULT false;
