-- DropIndex
DROP INDEX "public"."document_verifications_intern_id_key";

-- DropIndex
DROP INDEX "public"."notifications_intern_id_key";

-- RenameForeignKey
ALTER TABLE "public"."document_verifications" RENAME CONSTRAINT "document_verifications_intern_id_fkey" TO "document_verifications_employee_id_fkey";

-- RenameForeignKey
ALTER TABLE "public"."employee_details" RENAME CONSTRAINT "intern_details_user_id_fkey" TO "employee_details_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "public"."employee_documents" RENAME CONSTRAINT "intern_documents_intern_id_fkey" TO "employee_documents_employee_id_fkey";

-- RenameForeignKey
ALTER TABLE "public"."employee_info" RENAME CONSTRAINT "internship_info_department_id_fkey" TO "employee_info_department_id_fkey";

-- RenameForeignKey
ALTER TABLE "public"."employee_info" RENAME CONSTRAINT "internship_info_intern_id_fkey" TO "employee_info_employee_id_fkey";

-- RenameForeignKey
ALTER TABLE "public"."employee_info" RENAME CONSTRAINT "internship_info_position_id_fkey" TO "employee_info_position_id_fkey";

-- RenameForeignKey
ALTER TABLE "public"."employee_sos_details" RENAME CONSTRAINT "interns_sos_details_intern_id_fkey" TO "employee_sos_details_employee_id_fkey";

-- RenameForeignKey
ALTER TABLE "public"."notifications" RENAME CONSTRAINT "notifications_intern_id_fkey" TO "notifications_employee_id_fkey";

-- RenameIndex
ALTER INDEX "public"."intern_documents_intern_id_document_type_key" RENAME TO "employee_documents_employee_id_document_type_key";
