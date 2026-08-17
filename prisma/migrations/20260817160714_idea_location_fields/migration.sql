-- AlterTable
ALTER TABLE "ideas" ADD COLUMN     "location_address" TEXT,
ADD COLUMN     "location_lat" DECIMAL(9,6),
ADD COLUMN     "location_lng" DECIMAL(9,6),
ADD COLUMN     "location_map_link" TEXT,
ADD COLUMN     "location_name" TEXT;
