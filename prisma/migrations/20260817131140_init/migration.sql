-- AD-2: required for the exclusion constraint below (gist index support
-- over the equality operator on trip_id combined with the && overlap
-- operator on the date range).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "trip_visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "description" TEXT,
    "cover_image" TEXT,
    "visibility" "trip_visibility" NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sections_trip_id_idx" ON "sections"("trip_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AD-2: a Trip's Sections may never overlap (touching endpoints allowed).
-- Enforced at the database layer, not application code alone. Not
-- representable in schema.prisma, so it is hand-authored here; this file,
-- not schema.prisma, is authoritative for this constraint (see the note at
-- the top of schema.prisma). Only `prisma migrate deploy` is ever run
-- against a real database, so this is permanent, intentional drift.
--
-- DEVIATION FROM AD-2's literal text, disclosed per the spec's "Ask First"
-- rule (flagged for human confirmation, not silently applied): AD-2 writes
-- `daterange(start_date, end_date, '[]')`. Verified against Postgres 18:
-- because `date` is a discrete range subtype, an inclusive-inclusive
-- ('[]') range does NOT get "collapsed" away at the shared boundary -- two
-- Sections where one's end_date equals the next's start_date (e.g.
-- 2026-08-03..2026-08-07 and 2026-08-07..2026-08-10) test as OVERLAPPING
-- under '[]' (both ranges contain 2026-08-07), which would reject exactly
-- the touching-endpoints case that FR-5 and the Section glossary entry
-- require to be *allowed*. Using '[)' (inclusive start, exclusive end --
-- Postgres's canonical form for discrete ranges) instead of '[]' preserves
-- AD-2's mechanism (EXCLUDE USING gist + btree_gist, same two columns) but
-- makes touching endpoints non-overlapping while still rejecting any real
-- overlap, matching FR-5's explicit acceptance criteria and the I/O matrix
-- row for overlapping Sections.
ALTER TABLE "sections" ADD CONSTRAINT "sections_no_overlap_per_trip"
    EXCLUDE USING gist (
        "trip_id" WITH =,
        daterange("start_date", "end_date", '[)') WITH &&
    );
