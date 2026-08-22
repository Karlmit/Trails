-- AlterTable
ALTER TABLE "ideas" ADD COLUMN     "section_id" UUID;

-- CreateIndex
CREATE INDEX "ideas_section_id_idx" ON "ideas"("section_id");

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
