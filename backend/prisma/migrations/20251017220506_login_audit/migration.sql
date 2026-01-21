-- CreateEnum
CREATE TYPE "public"."LoginFailReason" AS ENUM ('RATE_LIMITED', 'MISSING_FIELDS', 'NO_SUCH_USER', 'WRONG_PASSWORD', 'BLOCKED', 'TEMP_ERROR');

-- CreateTable
CREATE TABLE "public"."login_events" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "email" VARCHAR(100),
    "success" BOOLEAN NOT NULL,
    "fail_reason" "public"."LoginFailReason",
    "ip" VARCHAR(45) NOT NULL,
    "country" VARCHAR(2),
    "region" VARCHAR(100),
    "city" VARCHAR(100),
    "ua" VARCHAR(255),
    "browser" VARCHAR(50),
    "os" VARCHAR(50),
    "device_type" VARCHAR(30),
    "device_id" VARCHAR(64),
    "fp_hash" VARCHAR(64),
    "tz_offset" INTEGER,
    "language" VARCHAR(35),
    "screen" VARCHAR(25),
    "platform" VARCHAR(50),
    "rl_limit" INTEGER,
    "rl_remaining" INTEGER,
    "rl_reset_at" TIMESTAMP(3),
    "status_code" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."known_devices" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_id" VARCHAR(64) NOT NULL,
    "fp_hash" VARCHAR(64),
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_ip" VARCHAR(45),
    "last_ua" VARCHAR(255),
    "last_country" VARCHAR(2),
    "last_region" VARCHAR(100),
    "last_city" VARCHAR(100),
    "trusted" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "known_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_events_email_created_idx" ON "public"."login_events"("email", "created_at");

-- CreateIndex
CREATE INDEX "login_events_user_created_idx" ON "public"."login_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "login_events_ip_created_idx" ON "public"."login_events"("ip", "created_at");

-- CreateIndex
CREATE INDEX "login_events_device_created_idx" ON "public"."login_events"("device_id", "created_at");

-- CreateIndex
CREATE INDEX "known_devices_user_id_idx" ON "public"."known_devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "known_devices_user_id_device_id_key" ON "public"."known_devices"("user_id", "device_id");

-- AddForeignKey
ALTER TABLE "public"."login_events" ADD CONSTRAINT "login_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."known_devices" ADD CONSTRAINT "known_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
