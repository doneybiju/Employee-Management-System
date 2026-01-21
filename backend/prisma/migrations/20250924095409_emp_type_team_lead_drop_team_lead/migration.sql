-- prisma/migrations/<timestamp>_emp_type_team_lead_drop_teamLead/migration.sql
BEGIN;

-- 1) Create the new enum that has team_lead
CREATE TYPE "public"."emp_type_new" AS ENUM ('intern','employee','team_lead');

-- 2) Re-type the column, mapping old 'owner' -> 'team_lead'
ALTER TABLE "public"."users"
  ALTER COLUMN "emp_type" DROP DEFAULT,
  ALTER COLUMN "emp_type" TYPE "public"."emp_type_new"
  USING (
    CASE
      WHEN "emp_type"::text = 'owner' THEN 'team_lead'::"public"."emp_type_new"
      ELSE "emp_type"::text::"public"."emp_type_new"
    END
  );

-- 3) Swap enum names and remove the old one
ALTER TYPE "public"."emp_type" RENAME TO "emp_type_old";

ALTER TYPE "public"."emp_type_new" RENAME TO "emp_type";

DROP TYPE "public"."emp_type_old";

-- 4) Restore default
ALTER TABLE "public"."users"
  ALTER COLUMN "emp_type" SET DEFAULT 'intern';

-- 5) Move boolean flag into the enum BEFORE dropping the column
UPDATE "public"."users"
SET "emp_type" = 'team_lead'
WHERE COALESCE("teamLead", false) = true;

-- 6) Drop the old boolean column
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "teamLead";

COMMIT;