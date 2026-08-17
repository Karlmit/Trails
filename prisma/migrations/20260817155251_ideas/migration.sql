-- CreateEnum
CREATE TYPE "idea_priority" AS ENUM ('MUST_DO', 'WOULD_LIKE', 'MAYBE');

-- CreateEnum
CREATE TYPE "weather_suitability" AS ENUM ('INDOOR', 'OUTDOOR', 'EITHER');

-- CreateTable
CREATE TABLE "ideas" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "priority" "idea_priority" NOT NULL,
    "weather_suitability" "weather_suitability" NOT NULL,
    "weather_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_expense_amount" DECIMAL(12,2),
    "estimated_expense_currency" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ideas_trip_id_idx" ON "ideas"("trip_id");

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
