/*
  Warnings:

  - You are about to drop the `_CategoryToContent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_CategoryToContent" DROP CONSTRAINT "_CategoryToContent_A_fkey";

-- DropForeignKey
ALTER TABLE "_CategoryToContent" DROP CONSTRAINT "_CategoryToContent_B_fkey";

-- AlterTable
ALTER TABLE "Content" ADD COLUMN     "category_id" TEXT;

-- DropTable
DROP TABLE "_CategoryToContent";

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
