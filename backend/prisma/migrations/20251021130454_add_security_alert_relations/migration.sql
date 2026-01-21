-- CreateEnum
CREATE TYPE "public"."AlertKind" AS ENUM ('IMPOSSIBLE_TRAVEL', 'NEW_COUNTRY', 'NEW_DEVICE', 'FAILED_STREAK', 'LOCKOUT');

-- CreateEnum
CREATE TYPE "public"."AlertSeverity" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "public"."known_devices" ADD COLUMN     "last_lat" DOUBLE PRECISION,
ADD COLUMN     "last_lon" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."login_events" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lon" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "public"."SecurityAlert" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "public"."AlertKind" NOT NULL,
    "severity" "public"."AlertSeverity" NOT NULL,
    "userId" INTEGER,
    "email" TEXT,
    "ip" VARCHAR(45),
    "country" VARCHAR(2),
    "region" TEXT,
    "city" TEXT,
    "deviceId" TEXT,
    "loginEventId" INTEGER,
    "details" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" INTEGER,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityAlert_loginEventId_key" ON "public"."SecurityAlert"("loginEventId");

-- CreateIndex
CREATE INDEX "SecurityAlert_createdAt_kind_severity_idx" ON "public"."SecurityAlert"("createdAt", "kind", "severity");

-- AddForeignKey
ALTER TABLE "public"."SecurityAlert" ADD CONSTRAINT "SecurityAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SecurityAlert" ADD CONSTRAINT "SecurityAlert_loginEventId_fkey" FOREIGN KEY ("loginEventId") REFERENCES "public"."login_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
