-- CreateTable
CREATE TABLE "public"."user_creation_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "surname" VARCHAR(50) NOT NULL,
    "company_email" VARCHAR(100) NOT NULL,
    "emp_id" VARCHAR(50) NOT NULL,
    "role" "public"."role" NOT NULL,
    "emp_type" "public"."emp_type" NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(255),

    CONSTRAINT "user_creation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_creation_log_created_idx" ON "public"."user_creation_logs"("created_at");

-- CreateIndex
CREATE INDEX "user_creation_log_user_idx" ON "public"."user_creation_logs"("user_id");
