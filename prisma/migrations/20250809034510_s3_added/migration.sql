-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Content_status" ADD VALUE 'uploading_local';
ALTER TYPE "Content_status" ADD VALUE 'uploading_s3';
ALTER TYPE "Content_status" ADD VALUE 'processing';
ALTER TYPE "Content_status" ADD VALUE 'failed';

-- AlterTable
ALTER TABLE "Content" ADD COLUMN     "checksum_sha256" TEXT,
ADD COLUMN     "etag" TEXT,
ADD COLUMN     "file_size_bytes" BIGINT,
ADD COLUMN     "original_name" TEXT,
ADD COLUMN     "s3_bucket" TEXT,
ADD COLUMN     "s3_key" TEXT,
ADD COLUMN     "s3_thumb_key" TEXT,
ADD COLUMN     "storage_provider" TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "content_status" SET DEFAULT 'draft';
