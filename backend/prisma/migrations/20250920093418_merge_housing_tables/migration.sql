/*
  Warnings:

  - You are about to drop the column `is_full` on the `rooms` table. All the data in the column will be lost.
  - You are about to drop the column `is_single` on the `rooms` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[apartment_id,month]` on the table `utilities` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[utility_id,intern_id]` on the table `utility_shares` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[utility_id,allocation_id]` on the table `utility_shares` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."utility_shares" DROP CONSTRAINT "utility_shares_allocation_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."utility_shares" DROP CONSTRAINT "utility_shares_intern_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."utility_shares" DROP CONSTRAINT "utility_shares_utility_id_fkey";

-- DropIndex
DROP INDEX "public"."rent_payments_intern_id_key";

-- DropIndex
DROP INDEX "public"."utility_payments_intern_id_key";

-- DropIndex
DROP INDEX "public"."utility_shares_intern_id_key";

-- DropIndex
DROP INDEX "public"."utility_shares_utility_id_key";

-- AlterTable
ALTER TABLE "public"."apartments" ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "shared_rooms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "single_rooms" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "apartment_name" SET DATA TYPE VARCHAR(50);

-- AlterTable
ALTER TABLE "public"."rooms" DROP COLUMN "is_full",
DROP COLUMN "is_single",
ADD COLUMN     "deposit" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "price" INTEGER,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "single" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "apartment_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."utilities" ALTER COLUMN "electricity" SET DEFAULT 0,
ALTER COLUMN "water" SET DEFAULT 0,
ALTER COLUMN "gas" SET DEFAULT 0,
ALTER COLUMN "other" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."utility_shares" ADD COLUMN     "final_notice_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminder_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reminder_last_sent" TIMESTAMP(3),
ALTER COLUMN "utility_id" DROP NOT NULL,
ALTER COLUMN "allocation_id" DROP NOT NULL,
ALTER COLUMN "emailed_at" DROP NOT NULL,
ALTER COLUMN "emailed_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "public"."utility_reminders" (
    "id" SERIAL NOT NULL,
    "utility_share_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utility_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rent_email_log" (
    "id" SERIAL NOT NULL,
    "allocation_id" INTEGER NOT NULL,
    "month" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "remaining" DECIMAL(12,2),
    "details" JSONB DEFAULT '{}',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utility_reminders_utility_share_id_kind_key" ON "public"."utility_reminders"("utility_share_id", "kind");

-- CreateIndex
CREATE INDEX "rent_email_log_main_idx" ON "public"."rent_email_log"("allocation_id", "month", "kind", "sent_at");

-- CreateIndex
CREATE INDEX "idx_rent_payments_alloc" ON "public"."rent_payments"("allocation_id");

-- CreateIndex
CREATE UNIQUE INDEX "utilities_apartment_id_month_key" ON "public"."utilities"("apartment_id", "month");

-- CreateIndex
CREATE INDEX "idx_utility_payments_alloc_month" ON "public"."utility_payments"("allocation_id", "month");

-- CreateIndex
CREATE INDEX "idx_utility_payments_intern_month" ON "public"."utility_payments"("intern_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "utility_shares_utility_id_intern_id_key" ON "public"."utility_shares"("utility_id", "intern_id");

-- CreateIndex
CREATE UNIQUE INDEX "utility_shares_utility_id_allocation_id_key" ON "public"."utility_shares"("utility_id", "allocation_id");

-- AddForeignKey
ALTER TABLE "public"."rent_payments" ADD CONSTRAINT "rent_payments_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."utility_shares" ADD CONSTRAINT "utility_shares_utility_id_fkey" FOREIGN KEY ("utility_id") REFERENCES "public"."utilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."utility_shares" ADD CONSTRAINT "utility_shares_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern_details"("intern_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."utility_shares" ADD CONSTRAINT "utility_shares_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."utility_reminders" ADD CONSTRAINT "utility_reminders_utility_share_id_fkey" FOREIGN KEY ("utility_share_id") REFERENCES "public"."utility_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rent_email_log" ADD CONSTRAINT "rent_email_log_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
