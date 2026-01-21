-- AlterTable: Add creation tracking columns to users table
ALTER TABLE "public"."users" ADD COLUMN "created_by" INTEGER;
ALTER TABLE "public"."users" ADD COLUMN "creation_ip" VARCHAR(45);
ALTER TABLE "public"."users" ADD COLUMN "creation_user_agent" VARCHAR(255);

-- CreateIndex: Add index on created_by column
CREATE INDEX "user_created_by_idx" ON "public"."users"("created_by");

-- DropTable: Remove user_creation_logs table
DROP TABLE IF EXISTS "public"."user_creation_logs";
