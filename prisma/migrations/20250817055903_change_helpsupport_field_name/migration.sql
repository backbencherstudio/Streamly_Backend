/*
  Warnings:

  - The values [Solved,Unsolved] on the enum `HelpSupportStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `issue_type` on the `help_and_support` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "HelpSupportStatus_new" AS ENUM ('Open', 'Resolved');
ALTER TABLE "help_and_support" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "help_and_support" ALTER COLUMN "status" TYPE "HelpSupportStatus_new" USING ("status"::text::"HelpSupportStatus_new");
ALTER TYPE "HelpSupportStatus" RENAME TO "HelpSupportStatus_old";
ALTER TYPE "HelpSupportStatus_new" RENAME TO "HelpSupportStatus";
DROP TYPE "HelpSupportStatus_old";
ALTER TABLE "help_and_support" ALTER COLUMN "status" SET DEFAULT 'Open';
COMMIT;

-- AlterTable
ALTER TABLE "help_and_support" DROP COLUMN "issue_type",
ADD COLUMN     "subject" TEXT,
ALTER COLUMN "status" SET DEFAULT 'Open';
