/*
  Warnings:

  - You are about to drop the column `category_id` on the `creator_channels` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "creator_channels" DROP CONSTRAINT "creator_channels_category_id_fkey";

-- AlterTable
ALTER TABLE "creator_channels" DROP COLUMN "category_id",
ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "banner" TEXT;
