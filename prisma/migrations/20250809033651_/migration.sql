/*
  Warnings:

  - The values [live] on the enum `Content_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Content_status_new" AS ENUM ('published', 'draft');
ALTER TABLE "Content" ALTER COLUMN "content_status" DROP DEFAULT;
ALTER TABLE "Content" ALTER COLUMN "content_status" TYPE "Content_status_new" USING ("content_status"::text::"Content_status_new");
ALTER TYPE "Content_status" RENAME TO "Content_status_old";
ALTER TYPE "Content_status_new" RENAME TO "Content_status";
DROP TYPE "Content_status_old";
ALTER TABLE "Content" ALTER COLUMN "content_status" SET DEFAULT 'published';
COMMIT;

-- AlterTable
ALTER TABLE "Content" ALTER COLUMN "content_status" SET DEFAULT 'published';
