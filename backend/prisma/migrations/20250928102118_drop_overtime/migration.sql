/*
  Warnings:

  - You are about to drop the `overtime_requests` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."overtime_requests" DROP CONSTRAINT "overtime_requests_user_id_fkey";

-- DropTable
DROP TABLE "public"."overtime_requests";
