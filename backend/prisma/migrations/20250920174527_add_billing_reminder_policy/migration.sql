-- CreateTable
CREATE TABLE "public"."BillingReminderPolicy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "everyDays" INTEGER NOT NULL DEFAULT 7,
    "sendHour" INTEGER NOT NULL DEFAULT 9,
    "includeUtility" BOOLEAN NOT NULL DEFAULT true,
    "includeRent" BOOLEAN NOT NULL DEFAULT true,
    "minDue" DECIMAL(12,2) NOT NULL DEFAULT 10.00,
    "ccEmail" VARCHAR(255),
    "bccEmail" VARCHAR(255),
    "lastRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingReminderPolicy_pkey" PRIMARY KEY ("id")
);
