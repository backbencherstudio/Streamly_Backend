-- AlterTable
ALTER TABLE "Content" ADD COLUMN     "trailer_for_id" TEXT;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_trailer_for_id_fkey" FOREIGN KEY ("trailer_for_id") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;
