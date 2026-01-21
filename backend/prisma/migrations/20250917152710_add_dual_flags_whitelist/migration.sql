-- AlterTable
ALTER TABLE "public"."reminder_whitelist" ADD COLUMN     "skipDeprov" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "skipDocs" BOOLEAN NOT NULL DEFAULT true;
