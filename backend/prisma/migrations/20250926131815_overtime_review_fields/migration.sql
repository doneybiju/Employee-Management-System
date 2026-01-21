-- DropForeignKey
ALTER TABLE "public"."Project" DROP CONSTRAINT "Project_createdById_fkey";

-- AlterTable
ALTER TABLE "public"."Project" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."overtime_requests" ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewer_id" INTEGER,
ADD COLUMN     "status" "public"."request_status" NOT NULL DEFAULT 'PENDING';

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
