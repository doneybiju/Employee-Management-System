-- CreateEnum
CREATE TYPE "public"."RequestKind" AS ENUM ('EXTRA_HOURS', 'ABSENCE');

-- CreateTable
CREATE TABLE "public"."employee_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "kind" "public"."RequestKind" NOT NULL,
    "date" DATE,
    "rangeStart" DATE,
    "rangeEnd" DATE,
    "start_min" INTEGER,
    "end_min" INTEGER,
    "minutes" INTEGER,
    "reason" TEXT,
    "status" "public"."request_status" NOT NULL DEFAULT 'PENDING',
    "reviewer_id" INTEGER,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."employee_requests" ADD CONSTRAINT "employee_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."employee_requests" ADD CONSTRAINT "employee_requests_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
