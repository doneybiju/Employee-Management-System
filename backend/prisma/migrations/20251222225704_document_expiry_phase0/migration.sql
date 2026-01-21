-- AlterTable
ALTER TABLE "public"."intern_documents" ADD COLUMN     "expiry_reminder_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiry_reminder_last_sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."document_expiry_policies" (
    "id" SERIAL NOT NULL,
    "document_type" "public"."document_type" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "days_before" INTEGER NOT NULL DEFAULT 30,
    "notify_user" BOOLEAN NOT NULL DEFAULT true,
    "notify_hr" BOOLEAN NOT NULL DEFAULT true,
    "repeat_every_days" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_expiry_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_expiry_policies_document_type_key" ON "public"."document_expiry_policies"("document_type");
