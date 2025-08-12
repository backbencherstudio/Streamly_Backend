-- AlterTable
ALTER TABLE "Favourite" ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "content_id" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "rating" INTEGER DEFAULT 0,
ADD COLUMN     "thumbnail" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "user_id" TEXT;

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users "("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
