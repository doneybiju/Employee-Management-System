-- CreateEnum
CREATE TYPE "public"."role" AS ENUM ('intern', 'hr', 'super_admin');

-- CreateEnum
CREATE TYPE "public"."status" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "public"."bill_type" AS ENUM ('Electricity', 'Water', 'Gas', 'Heating', 'Internet', 'Maintenance', 'Cleaning', 'Accommodation');

-- CreateEnum
CREATE TYPE "public"."bill_status" AS ENUM ('Pending', 'Paid', 'Overdue');

-- CreateEnum
CREATE TYPE "public"."request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."delay_unit" AS ENUM ('days', 'weeks', 'months');

-- CreateEnum
CREATE TYPE "public"."document_type" AS ENUM ('CV', 'ID_PASSPORT', 'ERASMUS_FORMS', 'INTERNSHIP_AGREEMENT', 'INSURANCE', 'ACCEPTANCE_LETTER', 'LEARNING_AGREEMENT', 'FINAL_REPORT', 'PROFILE_PICTURE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."document_status" AS ENUM ('pending', 'under_review', 'verified', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "public"."verification_action" AS ENUM ('approve', 'reject', 'request_revision', 'upload', 'delete');

-- CreateEnum
CREATE TYPE "public"."notification_type" AS ENUM ('document_uploaded', 'document_verified', 'document_rejected', 'document_expired', 'bill_due', 'system_announcement', 'housing_update');

-- CreateEnum
CREATE TYPE "public"."priority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "public"."smtp_encryption" AS ENUM ('NONE', 'STARTTLS', 'TLS');

-- CreateTable
CREATE TABLE "public"."intern_details" (
    "intern_id" UUID NOT NULL,
    "user_id" INTEGER,
    "name" TEXT NOT NULL,
    "nationality" VARCHAR(25),
    "gender" VARCHAR(20),
    "birthdate" DATE,
    "phone" VARCHAR(20),
    "email" VARCHAR(100),

    CONSTRAINT "intern_details_pkey" PRIMARY KEY ("intern_id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" SERIAL NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "surname" VARCHAR(50) NOT NULL,
    "companyEmail" VARCHAR(100) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" "public"."role" NOT NULL,
    "emp_id" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."interns_sos_details" (
    "id" SERIAL NOT NULL,
    "intern_id" UUID,
    "relative_phone_number" VARCHAR(25),
    "relation_with_intern" VARCHAR(15),

    CONSTRAINT "interns_sos_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."session_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "login_time" TIMESTAMP(3) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" VARCHAR(255) NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,

    CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."departments" (
    "id" SERIAL NOT NULL,
    "department_name" VARCHAR(50) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."positions" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "department_id" INTEGER NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."internship_info" (
    "id" SERIAL NOT NULL,
    "intern_id" UUID NOT NULL,
    "department_id" INTEGER,
    "position_id" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "supervisor" VARCHAR(100),
    "status" "public"."status" NOT NULL,

    CONSTRAINT "internship_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."apartments" (
    "id" SERIAL NOT NULL,
    "apartment_name" VARCHAR(20) NOT NULL,

    CONSTRAINT "apartments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rooms" (
    "id" SERIAL NOT NULL,
    "apartment_id" INTEGER NOT NULL,
    "room_number" VARCHAR(10) NOT NULL,
    "is_single" BOOLEAN NOT NULL DEFAULT true,
    "is_full" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."allocations" (
    "id" SERIAL NOT NULL,
    "intern_id" UUID NOT NULL,
    "room_id" INTEGER NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bills" (
    "id" SERIAL NOT NULL,
    "occupant_id" INTEGER NOT NULL,
    "bill_type" "public"."bill_type" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "public"."bill_status" NOT NULL,
    "arrival_date" DATE,
    "departure_date" DATE,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."requests" (
    "id" SERIAL NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "surname" VARCHAR(50) NOT NULL,
    "email" VARCHAR(100),
    "emp_id" VARCHAR(50),
    "joining_date" DATE,
    "created_by_id" INTEGER NOT NULL,
    "birthdate" DATE,
    "gender" VARCHAR(20),
    "nationality" VARCHAR(25),
    "personal_email" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20),
    "department_id" INTEGER,
    "end_date" DATE,
    "position_id" INTEGER,
    "status" "public"."request_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminUiConfig" (
    "id" INTEGER NOT NULL,
    "hrCols" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."overtime_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "work_date" DATE NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."deprovision_policy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "delay_amount" INTEGER NOT NULL DEFAULT 0,
    "delay_unit" "public"."delay_unit" NOT NULL DEFAULT 'days',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_run_at" TIMESTAMP(3),
    "last_deleted" INTEGER DEFAULT 0,
    "transfer_target_email" TEXT,

    CONSTRAINT "deprovision_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rent_payments" (
    "id" SERIAL NOT NULL,
    "intern_id" UUID NOT NULL,
    "allocation_id" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "rent_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."utilities" (
    "id" SERIAL NOT NULL,
    "apartment_id" INTEGER NOT NULL,
    "month" DATE NOT NULL,
    "electricity" DECIMAL(12,2),
    "water" DECIMAL(12,2),
    "gas" DECIMAL(12,2),
    "other" DECIMAL(12,2),
    "bill_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."utility_payments" (
    "id" SERIAL NOT NULL,
    "intern_id" UUID NOT NULL,
    "allocation_id" INTEGER NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utility_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."utility_shares" (
    "id" SERIAL NOT NULL,
    "utility_id" INTEGER NOT NULL,
    "intern_id" UUID NOT NULL,
    "allocation_id" INTEGER NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_to" TEXT,
    "email_status" TEXT DEFAULT 'queued',
    "emailed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message_id" TEXT,

    CONSTRAINT "utility_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."intern_documents" (
    "id" SERIAL NOT NULL,
    "intern_id" UUID NOT NULL,
    "document_type" "public"."document_type" NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "status" "public"."document_status" NOT NULL DEFAULT 'pending',
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "expiry_date" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intern_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."document_verifications" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "intern_id" UUID NOT NULL,
    "verifier_id" INTEGER,
    "action" "public"."verification_action" NOT NULL,
    "previous_status" "public"."document_status" NOT NULL,
    "new_status" "public"."document_status" NOT NULL,
    "comments" TEXT,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "intern_id" UUID NOT NULL,
    "type" "public"."notification_type" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "priority" "public"."priority" NOT NULL DEFAULT 'medium',
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."smtp_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "encryption" "public"."smtp_encryption" NOT NULL DEFAULT 'STARTTLS',
    "user" TEXT NOT NULL,
    "pass" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" INTEGER,

    CONSTRAINT "smtp_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentReminderPolicy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "everyDays" INTEGER NOT NULL DEFAULT 7,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastSent" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentReminderPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentReminderHistory" (
    "id" SERIAL NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRecipients" INTEGER NOT NULL,
    "missingBreakdown" JSONB,

    CONSTRAINT "DocumentReminderHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserReminderInbox" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "UserReminderInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intern_details_email_key" ON "public"."intern_details"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_companyEmail_key" ON "public"."users"("companyEmail");

-- CreateIndex
CREATE UNIQUE INDEX "users_emp_id_key" ON "public"."users"("emp_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_department_name_key" ON "public"."departments"("department_name");

-- CreateIndex
CREATE UNIQUE INDEX "positions_name_department_id_key" ON "public"."positions"("name", "department_id");

-- CreateIndex
CREATE UNIQUE INDEX "apartments_apartment_name_key" ON "public"."apartments"("apartment_name");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_apartment_id_room_number_key" ON "public"."rooms"("apartment_id", "room_number");

-- CreateIndex
CREATE UNIQUE INDEX "allocations_intern_id_key" ON "public"."allocations"("intern_id");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_requests_user_id_work_date_key" ON "public"."overtime_requests"("user_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "rent_payments_intern_id_key" ON "public"."rent_payments"("intern_id");

-- CreateIndex
CREATE UNIQUE INDEX "utility_payments_intern_id_key" ON "public"."utility_payments"("intern_id");

-- CreateIndex
CREATE UNIQUE INDEX "utility_shares_utility_id_key" ON "public"."utility_shares"("utility_id");

-- CreateIndex
CREATE UNIQUE INDEX "utility_shares_intern_id_key" ON "public"."utility_shares"("intern_id");

-- CreateIndex
CREATE UNIQUE INDEX "intern_documents_intern_id_document_type_key" ON "public"."intern_documents"("intern_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "document_verifications_intern_id_key" ON "public"."document_verifications"("intern_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_intern_id_key" ON "public"."notifications"("intern_id");

-- AddForeignKey
ALTER TABLE "public"."intern_details" ADD CONSTRAINT "intern_details_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."interns_sos_details" ADD CONSTRAINT "interns_sos_details_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern_details"("intern_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."session_logs" ADD CONSTRAINT "session_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."positions" ADD CONSTRAINT "positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."internship_info" ADD CONSTRAINT "internship_info_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern_details"("intern_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."internship_info" ADD CONSTRAINT "internship_info_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."internship_info" ADD CONSTRAINT "internship_info_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rooms" ADD CONSTRAINT "rooms_apartment_id_fkey" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."allocations" ADD CONSTRAINT "allocations_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern_details"("intern_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bills" ADD CONSTRAINT "bills_occupant_id_fkey" FOREIGN KEY ("occupant_id") REFERENCES "public"."allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."requests" ADD CONSTRAINT "requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."requests" ADD CONSTRAINT "requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."requests" ADD CONSTRAINT "requests_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."overtime_requests" ADD CONSTRAINT "overtime_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rent_payments" ADD CONSTRAINT "rent_payments_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern_details"("intern_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."utilities" ADD CONSTRAINT "utilities_apartment_id_fkey" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."utility_payments" ADD CONSTRAINT "utility_payments_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern_details"("intern_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."utility_payments" ADD CONSTRAINT "utility_payments_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."utility_shares" ADD CONSTRAINT "utility_shares_utility_id_fkey" FOREIGN KEY ("utility_id") REFERENCES "public"."utilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."utility_shares" ADD CONSTRAINT "utility_shares_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern_details"("intern_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."utility_shares" ADD CONSTRAINT "utility_shares_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."intern_documents" ADD CONSTRAINT "intern_documents_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern_details"("intern_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_verifications" ADD CONSTRAINT "document_verifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."intern_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_verifications" ADD CONSTRAINT "document_verifications_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern_details"("intern_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "public"."intern_details"("intern_id") ON DELETE CASCADE ON UPDATE CASCADE;
