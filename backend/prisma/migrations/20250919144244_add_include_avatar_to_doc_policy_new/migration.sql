/*
  Warnings:

  - You are about to drop the column `includeProfileImage` on the `DocumentDeletionPolicy` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."DocumentDeletionPolicy" DROP COLUMN "includeProfileImage",
ADD COLUMN     "includeAvatar" BOOLEAN NOT NULL DEFAULT false;
