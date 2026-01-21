/*
Warnings:

- You are about to drop the `BillingReminderPolicy` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `allocations` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `apartments` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `bills` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `rent_email_log` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `rent_payments` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `rooms` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `utilities` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `utility_payments` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `utility_reminders` table. If the table is not empty, all the data it contains will be lost.
- You are about to drop the `utility_shares` table. If the table is not empty, all the data it contains will be lost.

*/

-- Must drop the view first; it depends on allocations
DROP VIEW IF EXISTS public.allocations_view CASCADE;

-- DropForeignKey
ALTER TABLE "public"."allocations" DROP CONSTRAINT "allocations_intern_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."bills" DROP CONSTRAINT "bills_occupant_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."rent_email_log" DROP CONSTRAINT "rent_email_log_allocation_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."rent_payments" DROP CONSTRAINT "rent_payments_allocation_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."rent_payments" DROP CONSTRAINT "rent_payments_intern_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."rooms" DROP CONSTRAINT "rooms_apartment_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."utilities" DROP CONSTRAINT "utilities_apartment_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."utility_payments" DROP CONSTRAINT "utility_payments_allocation_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."utility_payments" DROP CONSTRAINT "utility_payments_intern_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."utility_reminders" DROP CONSTRAINT "utility_reminders_utility_share_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."utility_shares" DROP CONSTRAINT "utility_shares_allocation_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."utility_shares" DROP CONSTRAINT "utility_shares_intern_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."utility_shares" DROP CONSTRAINT "utility_shares_utility_id_fkey";

-- DropTable
DROP TABLE "public"."BillingReminderPolicy";

-- DropTable
DROP TABLE "public"."allocations";

-- DropTable
DROP TABLE "public"."apartments";

-- DropTable
DROP TABLE "public"."bills";

-- DropTable
DROP TABLE "public"."rent_email_log";

-- DropTable
DROP TABLE "public"."rent_payments";

-- DropTable
DROP TABLE "public"."rooms";

-- DropTable
DROP TABLE "public"."utilities";

-- DropTable
DROP TABLE "public"."utility_payments";

-- DropTable
DROP TABLE "public"."utility_reminders";

-- DropTable
DROP TABLE "public"."utility_shares";

-- DropEnum
DROP TYPE "public"."bill_status";

-- DropEnum
DROP TYPE "public"."bill_type";