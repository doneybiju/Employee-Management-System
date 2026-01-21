-- AlterTable: Add creator role/empType and creation method to users table
ALTER TABLE "public"."users" ADD COLUMN "created_by_role" "public"."role";
ALTER TABLE "public"."users" ADD COLUMN "created_by_emp_type" "public"."emp_type";
ALTER TABLE "public"."users" ADD COLUMN "creation_method" VARCHAR(50);
