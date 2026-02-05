-- Remove legacy enum values from StorageTier (free, premium)
-- This migration assumes any existing rows have already been normalized:
--   premium -> most_popular
--   free    -> basic

BEGIN;

-- 1) Create the new enum type with plan-based values only
CREATE TYPE "StorageTier_new" AS ENUM ('basic', 'most_popular', 'family', 'No_plan');

-- 2) Drop default (if any) before type swap
ALTER TABLE "user_storage_quotas" ALTER COLUMN "tier" DROP DEFAULT;

-- 3) Alter column type to the new enum
ALTER TABLE "user_storage_quotas"
  ALTER COLUMN "tier" TYPE "StorageTier_new"
  USING ("tier"::text::"StorageTier_new");

-- 4) Set the new default
ALTER TABLE "user_storage_quotas" ALTER COLUMN "tier" SET DEFAULT 'No_plan';

-- 5) Replace the old enum type
DROP TYPE "StorageTier";
ALTER TYPE "StorageTier_new" RENAME TO "StorageTier";

COMMIT;
