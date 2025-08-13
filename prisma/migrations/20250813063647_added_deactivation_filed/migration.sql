/*
  Warnings:

  - You are about to drop the column `deactivationDate` on the `users ` table. All the data in the column will be lost.
  - You are about to drop the column `deactivationPeriod` on the `users ` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users " DROP COLUMN "deactivationDate",
DROP COLUMN "deactivationPeriod",
ADD COLUMN     "deactivation_end_date" TIMESTAMP(3),
ADD COLUMN     "deactivation_start_date" TIMESTAMP(3);
