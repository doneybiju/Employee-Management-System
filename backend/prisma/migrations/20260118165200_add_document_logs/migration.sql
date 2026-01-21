-- CreateTable: document_logs
CREATE TABLE "public"."document_logs" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "document_type" VARCHAR(50) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_id" VARCHAR(255),
    "intern_id" UUID NOT NULL,
    "intern_name" VARCHAR(200),
    "user_id" INTEGER,
    "performed_by" INTEGER NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "expiry_date" TIMESTAMP(3),

    CONSTRAINT "document_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_log_intern_idx" ON "public"."document_logs"("intern_id");
CREATE INDEX "document_log_performer_idx" ON "public"."document_logs"("performed_by");
CREATE INDEX "document_log_performed_idx" ON "public"."document_logs"("performed_at");
CREATE INDEX "document_log_action_idx" ON "public"."document_logs"("action");

-- AddForeignKey
ALTER TABLE "public"."document_logs" ADD CONSTRAINT "document_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
