-- CreateEnum
CREATE TYPE "CreatorPlan" AS ENUM ('basic', 'family', 'most_popular');

-- CreateEnum
CREATE TYPE "CreatorChannelStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'creator';

-- AlterTable
ALTER TABLE "Content" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "creator_channel_id" TEXT,
ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "review_status" "ReviewStatus" NOT NULL DEFAULT 'approved',
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "creator_subscription_id" TEXT;

-- CreateTable
CREATE TABLE "creator_services" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT,
    "plan" "CreatorPlan" NOT NULL,
    "videos_per_month" INTEGER,
    "stripe_product_id" TEXT,
    "stripe_price_id" TEXT,

    CONSTRAINT "creator_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_subscriptions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "creator_service_id" TEXT,
    "renewal_date" TIMESTAMP(3),
    "plan" "CreatorPlan" NOT NULL,
    "payment_method" "Payment_method" NOT NULL DEFAULT 'No_pay',
    "transaction_id" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'active',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),

    CONSTRAINT "creator_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_channels" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "category_id" TEXT,
    "status" "CreatorChannelStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,

    CONSTRAINT "creator_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_services_stripe_product_id_key" ON "creator_services"("stripe_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_services_stripe_price_id_key" ON "creator_services"("stripe_price_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_subscriptions_transaction_id_key" ON "creator_subscriptions"("transaction_id");

-- CreateIndex
CREATE INDEX "creator_subscriptions_user_id_status_idx" ON "creator_subscriptions"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "creator_channels_user_id_key" ON "creator_channels"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "creator_channels_slug_key" ON "creator_channels"("slug");

-- CreateIndex
CREATE INDEX "creator_channels_status_idx" ON "creator_channels"("status");

-- AddForeignKey
ALTER TABLE "creator_subscriptions" ADD CONSTRAINT "creator_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_subscriptions" ADD CONSTRAINT "creator_subscriptions_creator_service_id_fkey" FOREIGN KEY ("creator_service_id") REFERENCES "creator_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_channels" ADD CONSTRAINT "creator_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_channels" ADD CONSTRAINT "creator_channels_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_channels" ADD CONSTRAINT "creator_channels_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_creator_subscription_id_fkey" FOREIGN KEY ("creator_subscription_id") REFERENCES "creator_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_creator_channel_id_fkey" FOREIGN KEY ("creator_channel_id") REFERENCES "creator_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
