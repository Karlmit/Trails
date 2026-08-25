-- Multi-language support: sv is the app-wide default, en the only other
-- supported locale for now (see prisma/schema.prisma's Locale enum comment).

-- CreateEnum
CREATE TYPE "locale" AS ENUM ('sv', 'en');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "locale" "locale" NOT NULL DEFAULT 'sv';
