-- CreateTable: user_update_logs
CREATE TABLE "public"."user_update_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "intern_id" UUID,
    "updated_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "field_name" VARCHAR(100) NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(255),

    CONSTRAINT "user_update_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_update_log_user_idx" ON "public"."user_update_logs"("user_id");
CREATE INDEX "user_update_log_intern_idx" ON "public"."user_update_logs"("intern_id");
CREATE INDEX "user_update_log_updater_idx" ON "public"."user_update_logs"("updated_by");
CREATE INDEX "user_update_log_updated_idx" ON "public"."user_update_logs"("updated_at");

-- AddForeignKey
ALTER TABLE "public"."user_update_logs" ADD CONSTRAINT "user_update_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."user_update_logs" ADD CONSTRAINT "user_update_logs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
