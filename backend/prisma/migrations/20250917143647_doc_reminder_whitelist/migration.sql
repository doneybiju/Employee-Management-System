-- CreateTable
CREATE TABLE "public"."reminder_whitelist" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "reason" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminder_whitelist_userId_key" ON "public"."reminder_whitelist"("userId");

-- AddForeignKey
ALTER TABLE "public"."reminder_whitelist" ADD CONSTRAINT "reminder_whitelist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
