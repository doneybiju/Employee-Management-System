-- AlterTable
ALTER TABLE "public"."DocumentDeletionPolicy" ALTER COLUMN "lastDeleted" DROP NOT NULL,
ALTER COLUMN "includeProfileImage" SET DEFAULT false;
