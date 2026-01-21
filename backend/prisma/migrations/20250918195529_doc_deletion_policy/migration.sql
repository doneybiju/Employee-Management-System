-- CreateTable
CREATE TABLE "public"."DocumentDeletionPolicy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "delayAmount" INTEGER NOT NULL DEFAULT 0,
    "delayUnit" "public"."delay_unit" NOT NULL DEFAULT 'days',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastDeleted" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentDeletionPolicy_pkey" PRIMARY KEY ("id")
);
