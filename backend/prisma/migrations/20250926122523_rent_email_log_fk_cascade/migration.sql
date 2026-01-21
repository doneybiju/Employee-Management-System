-- Drop old FK (name may differ in your DB; confirm with \d "rent_email_log")
ALTER TABLE "rent_email_log"
DROP CONSTRAINT IF EXISTS "rent_email_log_allocation_id_fkey";

-- Recreate with ON DELETE CASCADE
ALTER TABLE "rent_email_log"
ADD CONSTRAINT "rent_email_log_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "allocations" ("id") ON DELETE CASCADE;