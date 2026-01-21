-- AlterTable
ALTER TABLE "public"."DocumentReminderPolicy" ADD COLUMN     "autoPurgeDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "autoPurgeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastPurgeAt" TIMESTAMP(3);
