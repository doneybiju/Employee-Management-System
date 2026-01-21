-- CreateEnum
CREATE TYPE "public"."emp_type" AS ENUM ('intern', 'employee', 'owner');

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "emp_type" "public"."emp_type" NOT NULL DEFAULT 'intern';
