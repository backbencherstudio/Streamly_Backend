/*
  Warnings:

  - The values [vredit_card] on the enum `Payment_method` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[stripe_product_id]` on the table `services` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripe_price_id]` on the table `services` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Payment_method_new" AS ENUM ('No_pay', 'credit_card', 'stripe', 'paypal');
ALTER TABLE "Subscription" ALTER COLUMN "payment_method" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "payment_method" TYPE "Payment_method_new" USING ("payment_method"::text::"Payment_method_new");
ALTER TYPE "Payment_method" RENAME TO "Payment_method_old";
ALTER TYPE "Payment_method_new" RENAME TO "Payment_method";
DROP TYPE "Payment_method_old";
ALTER TABLE "Subscription" ALTER COLUMN "payment_method" SET DEFAULT 'No_pay';
COMMIT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "stripe_price_id" TEXT,
ADD COLUMN     "stripe_product_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "services_stripe_product_id_key" ON "services"("stripe_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_stripe_price_id_key" ON "services"("stripe_price_id");
