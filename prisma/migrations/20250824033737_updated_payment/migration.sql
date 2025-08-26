/*
  Warnings:

  - A unique constraint covering the columns `[provider_payment_intent_id]` on the table `payment_transactions` will be added. If there are existing duplicate values, this will fail.
  - Made the column `status` on table `payment_transactions` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "provider_charge_id" TEXT,
ADD COLUMN     "provider_customer_id" TEXT,
ADD COLUMN     "provider_payment_intent_id" TEXT,
ADD COLUMN     "provider_payment_method_id" TEXT,
ALTER COLUMN "status" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_payment_intent_id_key" ON "payment_transactions"("provider_payment_intent_id");
