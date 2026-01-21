-- DropForeignKey
ALTER TABLE "public"."rent_email_log" DROP CONSTRAINT "rent_email_log_allocation_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."rent_email_log" ADD CONSTRAINT "rent_email_log_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
