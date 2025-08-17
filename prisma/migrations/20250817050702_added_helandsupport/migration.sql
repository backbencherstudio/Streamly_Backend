-- CreateEnum
CREATE TYPE "HelpSupportStatus" AS ENUM ('Solved', 'Unsolved');

-- CreateTable
CREATE TABLE "help_and_support" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT,
    "issue_type" TEXT,
    "description" TEXT,
    "status" "HelpSupportStatus" NOT NULL DEFAULT 'Unsolved',

    CONSTRAINT "help_and_support_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "help_and_support" ADD CONSTRAINT "help_and_support_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users "("id") ON DELETE SET NULL ON UPDATE CASCADE;
