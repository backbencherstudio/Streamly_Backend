-- CreateTable
CREATE TABLE "content_views" (
    "id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,

    CONSTRAINT "content_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_views_user_id_content_id_viewed_at_idx" ON "content_views"("user_id", "content_id", "viewed_at");

-- AddForeignKey
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users "("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
