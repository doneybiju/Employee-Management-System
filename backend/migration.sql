-- Migration Script: Intern to Employee Refactor

BEGIN;

-- 1. Update Enums
-- Adding 'employee' to Role enum.
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'employee';

-- 2. Migrate Data (Role)
-- Update users with 'intern' role to 'employee'
UPDATE "users" SET "role" = 'employee' WHERE "role" = 'intern';

-- 3. Rename Tables
ALTER TABLE IF EXISTS "intern_details" RENAME TO "employee_details";
ALTER TABLE IF EXISTS "interns_sos_details" RENAME TO "employee_sos_details";
ALTER TABLE IF EXISTS "intern_documents" RENAME TO "employee_documents";
ALTER TABLE IF EXISTS "internship_info" RENAME TO "employee_info";

-- 4. Rename Columns
-- employee_details
ALTER TABLE "employee_details" RENAME COLUMN "intern_id" TO "employee_id";

-- employee_sos_details
ALTER TABLE "employee_sos_details" RENAME COLUMN "intern_id" TO "employee_id";
ALTER TABLE "employee_sos_details" RENAME COLUMN "relation_with_intern" TO "relation_with_employee";

-- employee_info
ALTER TABLE "employee_info" RENAME COLUMN "intern_id" TO "employee_id";

-- employee_documents
ALTER TABLE "employee_documents" RENAME COLUMN "intern_id" TO "employee_id";

-- document_verifications
ALTER TABLE "document_verifications" RENAME COLUMN "intern_id" TO "employee_id";

-- notifications
ALTER TABLE "notifications" RENAME COLUMN "intern_id" TO "employee_id";

-- user_update_logs
ALTER TABLE "user_update_logs" RENAME COLUMN "intern_id" TO "employee_id";

-- document_logs
ALTER TABLE "document_logs" RENAME COLUMN "intern_id" TO "employee_id";
ALTER TABLE "document_logs" RENAME COLUMN "intern_name" TO "employee_name";

-- 5. Fix Foreign Key Constraint Names (Optional but recommended for consistency)
-- Note: Postgres does not automatically rename constraints when renaming tables/columns usually,
-- but Prisma might handle them based on the new schema.
-- However, if we are just renaming at DB level, the constraints usually still point to the right OIDs.
-- We might want to rename indices too.

ALTER INDEX IF EXISTS "intern_details_pkey" RENAME TO "employee_details_pkey";
ALTER INDEX IF EXISTS "intern_details_email_key" RENAME TO "employee_details_email_key";

ALTER INDEX IF EXISTS "interns_sos_details_pkey" RENAME TO "employee_sos_details_pkey";

ALTER INDEX IF EXISTS "internship_info_pkey" RENAME TO "employee_info_pkey";

ALTER INDEX IF EXISTS "intern_documents_pkey" RENAME TO "employee_documents_pkey";
ALTER INDEX IF EXISTS "intern_document_per_type" RENAME TO "employee_document_per_type";
ALTER INDEX IF EXISTS "intern_docs_type_expiry_idx" RENAME TO "employee_docs_type_expiry_idx";

ALTER INDEX IF EXISTS "document_verifications_intern_id_key" RENAME TO "document_verifications_employee_id_key";

ALTER INDEX IF EXISTS "notifications_intern_id_key" RENAME TO "notifications_employee_id_key";

ALTER INDEX IF EXISTS "user_update_log_intern_idx" RENAME TO "user_update_log_employee_idx";

ALTER INDEX IF EXISTS "document_log_intern_idx" RENAME TO "document_log_employee_idx";

COMMIT;
