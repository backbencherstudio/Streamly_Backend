-- CreateEnum
CREATE TYPE "statusType" AS ENUM ('published', 'draft');

-- AlterTable
ALTER TABLE "Content" ADD COLUMN     "status" "statusType" DEFAULT 'published',
ADD COLUMN     "type" TEXT DEFAULT '4k',
ADD COLUMN     "view_count" INTEGER DEFAULT 0;
