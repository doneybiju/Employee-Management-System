BEGIN;

-- 1) Migrate role values (now safe because enum value was added in previous migration)
UPDATE "users" SET "role" = 'employee' WHERE "role" = 'intern';

-- 2) Rename tables
ALTER TABLE IF EXISTS "intern_details" RENAME TO "employee_details";

ALTER TABLE IF EXISTS "interns_sos_details"
RENAME TO "employee_sos_details";

ALTER TABLE IF EXISTS "intern_documents"
RENAME TO "employee_documents";

ALTER TABLE IF EXISTS "internship_info" RENAME TO "employee_info";

-- 3) Rename columns
ALTER TABLE "employee_details"
RENAME COLUMN "intern_id" TO "employee_id";

ALTER TABLE "employee_sos_details"
RENAME COLUMN "intern_id" TO "employee_id";

ALTER TABLE "employee_sos_details"
RENAME COLUMN "relation_with_intern" TO "relation_with_employee";

ALTER TABLE "employee_info"
RENAME COLUMN "intern_id" TO "employee_id";

ALTER TABLE "employee_documents"
RENAME COLUMN "intern_id" TO "employee_id";

ALTER TABLE "document_verifications"
RENAME COLUMN "intern_id" TO "employee_id";

ALTER TABLE "notifications"
RENAME COLUMN "intern_id" TO "employee_id";

ALTER TABLE "user_update_logs"
RENAME COLUMN "intern_id" TO "employee_id";

ALTER TABLE "document_logs"
RENAME COLUMN "intern_id" TO "employee_id";

ALTER TABLE "document_logs"
RENAME COLUMN "intern_name" TO "employee_name";

-- 4) Drop wrong uniqueness (if these exist)
ALTER TABLE "notifications"
DROP CONSTRAINT IF EXISTS "notifications_employee_id_key";

DROP INDEX IF EXISTS "notifications_employee_id_key";

ALTER TABLE "document_verifications"
DROP CONSTRAINT IF EXISTS "document_verifications_employee_id_key";

DROP INDEX IF EXISTS "document_verifications_employee_id_key";

-- 5) Rename indexes (best-effort)
ALTER INDEX IF EXISTS "intern_details_pkey"
RENAME TO "employee_details_pkey";

ALTER INDEX IF EXISTS "intern_details_email_key"
RENAME TO "employee_details_email_key";

ALTER INDEX IF EXISTS "interns_sos_details_pkey"
RENAME TO "employee_sos_details_pkey";

ALTER INDEX IF EXISTS "internship_info_pkey"
RENAME TO "employee_info_pkey";

ALTER INDEX IF EXISTS "intern_documents_pkey"
RENAME TO "employee_documents_pkey";

ALTER INDEX IF EXISTS "intern_document_per_type"
RENAME TO "employee_document_per_type";

ALTER INDEX IF EXISTS "intern_docs_type_expiry_idx"
RENAME TO "employee_docs_type_expiry_idx";

ALTER INDEX IF EXISTS "user_update_log_intern_idx"
RENAME TO "user_update_log_employee_idx";

ALTER INDEX IF EXISTS "document_log_intern_idx"
RENAME TO "document_log_employee_idx";

COMMIT;