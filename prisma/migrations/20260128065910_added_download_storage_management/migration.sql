-- CreateEnum
CREATE TYPE "DownloadStatus" AS ENUM ('pending', 'downloading', 'completed', 'paused', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "StorageTier" AS ENUM ('free', 'premium', 'family');

-- CreateTable
CREATE TABLE "downloads" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "status" "DownloadStatus" NOT NULL DEFAULT 'pending',
    "quality" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "file_size_bytes" BIGINT,
    "downloaded_bytes" BIGINT NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "error_message" TEXT,
    "failed_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_storage_quotas" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "tier" "StorageTier" NOT NULL DEFAULT 'free',
    "total_storage_bytes" BIGINT NOT NULL,
    "used_storage_bytes" BIGINT NOT NULL DEFAULT 0,
    "auto_delete_enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_delete_days" INTEGER NOT NULL DEFAULT 30,
    "notification_threshold" INTEGER NOT NULL DEFAULT 80,

    CONSTRAINT "user_storage_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "downloads_user_id_status_idx" ON "downloads"("user_id", "status");

-- CreateIndex
CREATE INDEX "downloads_expires_at_idx" ON "downloads"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "downloads_user_id_content_id_key" ON "downloads"("user_id", "content_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_storage_quotas_user_id_key" ON "user_storage_quotas"("user_id");

-- AddForeignKey
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_storage_quotas" ADD CONSTRAINT "user_storage_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
