-- CreateEnum
CREATE TYPE "Status" AS ENUM ('active', 'inactive', 'suspended', 'expired', 'deactivated');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('normal', 'premium', 'admin');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('most_popular', 'basic', 'family', 'No_plan');

-- CreateEnum
CREATE TYPE "Payment_method" AS ENUM ('No_pay', 'vredit_card', 'stripe', 'paypal');

-- CreateEnum
CREATE TYPE "Genra" AS ENUM ('action', 'adventure', 'animation', 'biography', 'comedy', 'crime', 'documentary', 'drama', 'family', 'fantasy', 'history', 'horror', 'music', 'musical', 'mystery', 'romance', 'sci_fi', 'sport', 'thriller', 'war', 'western');

-- CreateEnum
CREATE TYPE "Content_status" AS ENUM ('published', 'draft', 'uploading_local', 'uploading_s3', 'processing', 'failed');

-- CreateEnum
CREATE TYPE "statusType" AS ENUM ('published', 'pending', 'unpublished', 'archived', 'deleted');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('movie', 'series', 'episode', 'trailer', 'music_video');

-- CreateEnum
CREATE TYPE "clintStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "paymentStatus" AS ENUM ('paid', 'pending', 'due');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('progress', 'completed', 'pending', 'canceled');

-- CreateEnum
CREATE TYPE "HelpSupportStatus" AS ENUM ('Open', 'Resolved');

-- CreateTable
CREATE TABLE "temp" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_verified" INTEGER DEFAULT 0,

    CONSTRAINT "temp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "email" TEXT NOT NULL,
    "name" TEXT,
    "address" TEXT,
    "password" TEXT,
    "customer_id" TEXT,
    "country" TEXT,
    "gender" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "role" "Role" NOT NULL DEFAULT 'normal',
    "avatar" TEXT,
    "date_of_birth" DATE,
    "city" TEXT,
    "phone_number" TEXT,
    "suspend_endTime" TIMESTAMP(3),
    "state" TEXT,
    "postal_code" TEXT,
    "deactivation_start_date" TIMESTAMP(3),
    "deactivation_end_date" TIMESTAMP(3),
    "is_subscribed" BOOLEAN DEFAULT false,
    "bio" TEXT,
    "is_two_factor_enabled" INTEGER DEFAULT 0,
    "two_factor_secret" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_payment_methods" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT,
    "payment_method_id" TEXT,
    "checkout_id" TEXT,

    CONSTRAINT "user_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "category" TEXT,
    "label" TEXT,
    "description" TEXT,
    "key" TEXT,
    "default_value" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT,
    "setting_id" TEXT,
    "value" TEXT,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "user_id" TEXT,
    "subscription_id" TEXT,
    "provider" TEXT,
    "provider_payment_intent_id" TEXT,
    "provider_charge_id" TEXT,
    "provider_customer_id" TEXT,
    "provider_payment_method_id" TEXT,
    "price" DECIMAL(65,30),
    "currency" TEXT,
    "paid_amount" DECIMAL(65,30),
    "paid_currency" TEXT,
    "payment_method" TEXT,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_events" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "type" TEXT,
    "text" TEXT,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "sender_id" TEXT,
    "receiver_id" TEXT,
    "notification_event_id" TEXT,
    "entity_id" TEXT,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" TEXT,
    "email" TEXT,
    "price" DOUBLE PRECISION,
    "user_id" TEXT,
    "renewal_date" TIMESTAMP(3),
    "plan" "Plan" NOT NULL DEFAULT 'No_plan',
    "payment_method" "Payment_method" NOT NULL DEFAULT 'No_pay',
    "transaction_id" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'active',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "features" TEXT[],
    "plan" "Plan" NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Live_streaming" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "all_live" TEXT[],
    "live_sports" TEXT[],

    CONSTRAINT "Live_streaming_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favourites" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content_id" TEXT,
    "user_id" TEXT,
    "category_id" TEXT,
    "title" TEXT,
    "thumbnail" TEXT,
    "description" TEXT,
    "rating" INTEGER DEFAULT 0,

    CONSTRAINT "favourites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin_settings" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "title" TEXT,
    "description" TEXT,
    "genre" "Genra"[],
    "category_id" TEXT,
    "content_type" "ContentType" NOT NULL DEFAULT 'movie',
    "mime_type" TEXT,
    "duration_seconds" INTEGER,
    "content_status" "Content_status" NOT NULL,
    "storage_provider" TEXT,
    "s3_bucket" TEXT,
    "s3_key" TEXT,
    "s3_thumb_key" TEXT,
    "original_name" TEXT,
    "file_size_bytes" BIGINT,
    "etag" TEXT,
    "checksum_sha256" TEXT,
    "quality" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "thumbnail" TEXT,
    "video" TEXT,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "series_id" TEXT,
    "season_number" INTEGER,
    "episode_number" INTEGER,
    "release_date" TIMESTAMP(3),

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_views" (
    "id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,

    CONSTRAINT "content_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casts" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "name" TEXT,
    "role" TEXT,
    "bio" TEXT,
    "birth_date" DATE,
    "photo" TEXT,
    "contentId" TEXT,

    CONSTRAINT "casts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT,
    "content_id" TEXT,
    "rating" INTEGER DEFAULT 0,
    "comment" TEXT,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "name" TEXT,
    "slug" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "features" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "name" TEXT,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_settings" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "data_export_backup" INTEGER,
    "session_timeout" INTEGER,
    "failed_login_attempts" INTEGER,
    "password_expiry" INTEGER,

    CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_histories" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "sort_order" INTEGER DEFAULT 0,
    "type" TEXT,
    "subject" TEXT,
    "body" TEXT,

    CONSTRAINT "email_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_history_recipients" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "email_history_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,

    CONSTRAINT "email_history_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order_status" "OrderStatus" NOT NULL DEFAULT 'progress',
    "subscription_id" TEXT,
    "user_id" TEXT,
    "status" "clintStatus" NOT NULL DEFAULT 'active',
    "ammount" DOUBLE PRECISION,
    "user_name" TEXT,
    "user_email" TEXT,
    "pakage_name" TEXT,
    "payment_status" "paymentStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_and_support" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "username" TEXT,
    "email" TEXT,
    "user_id" TEXT,
    "subject" TEXT,
    "description" TEXT,
    "status" "HelpSupportStatus" NOT NULL DEFAULT 'Open',

    CONSTRAINT "help_and_support_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ServicesToSubscription" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ServicesToSubscription_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "temp_email_key" ON "temp"("email");

-- CreateIndex
CREATE UNIQUE INDEX "temp_otp_key" ON "temp"("otp");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_payment_intent_id_key" ON "payment_transactions"("provider_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "favourites_user_id_content_id_key" ON "favourites"("user_id", "content_id");

-- CreateIndex
CREATE INDEX "Content_category_id_idx" ON "Content"("category_id");

-- CreateIndex
CREATE INDEX "Content_is_premium_idx" ON "Content"("is_premium");

-- CreateIndex
CREATE INDEX "Content_release_date_idx" ON "Content"("release_date");

-- CreateIndex
CREATE INDEX "Content_series_id_idx" ON "Content"("series_id");

-- CreateIndex
CREATE INDEX "Content_view_count_idx" ON "Content"("view_count");

-- CreateIndex
CREATE INDEX "Content_deleted_at_idx" ON "Content"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "Content_series_id_season_number_episode_number_key" ON "Content"("series_id", "season_number", "episode_number");

-- CreateIndex
CREATE INDEX "content_views_user_id_content_id_viewed_at_idx" ON "content_views"("user_id", "content_id", "viewed_at");

-- CreateIndex
CREATE INDEX "content_views_content_id_viewed_at_idx" ON "content_views"("content_id", "viewed_at");

-- CreateIndex
CREATE INDEX "content_views_user_id_idx" ON "content_views"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_user_id_content_id_key" ON "ratings"("user_id", "content_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "_ServicesToSubscription_B_index" ON "_ServicesToSubscription"("B");

-- AddForeignKey
ALTER TABLE "user_payment_methods" ADD CONSTRAINT "user_payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_setting_id_fkey" FOREIGN KEY ("setting_id") REFERENCES "settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_notification_event_id_fkey" FOREIGN KEY ("notification_event_id") REFERENCES "notification_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casts" ADD CONSTRAINT "casts_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_history_recipients" ADD CONSTRAINT "email_history_recipients_email_history_id_fkey" FOREIGN KEY ("email_history_id") REFERENCES "email_histories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_history_recipients" ADD CONSTRAINT "email_history_recipients_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_and_support" ADD CONSTRAINT "help_and_support_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServicesToSubscription" ADD CONSTRAINT "_ServicesToSubscription_A_fkey" FOREIGN KEY ("A") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServicesToSubscription" ADD CONSTRAINT "_ServicesToSubscription_B_fkey" FOREIGN KEY ("B") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
