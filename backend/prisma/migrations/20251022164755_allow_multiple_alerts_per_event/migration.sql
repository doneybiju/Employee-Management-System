/*
  Warnings:

  - A unique constraint covering the columns `[loginEventId,kind]` on the table `SecurityAlert` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."SecurityAlert_loginEventId_key";

-- CreateIndex
CREATE INDEX "SecurityAlert_loginEventId_idx" ON "public"."SecurityAlert"("loginEventId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityAlert_loginEventId_kind_key" ON "public"."SecurityAlert"("loginEventId", "kind");
