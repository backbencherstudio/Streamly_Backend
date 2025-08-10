/*
  Warnings:

  - You are about to drop the column `amount` on the `payment_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `raw_status` on the `payment_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `reference_number` on the `payment_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `payment_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `withdraw_via` on the `payment_transactions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payment_transactions" DROP COLUMN "amount",
DROP COLUMN "raw_status",
DROP COLUMN "reference_number",
DROP COLUMN "type",
DROP COLUMN "withdraw_via",
ADD COLUMN     "payment_method" TEXT,
ADD COLUMN     "price" DECIMAL(65,30);
