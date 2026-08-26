-- AlterTable
ALTER TABLE "Permission" ADD COLUMN     "canComment" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "canView" SET DEFAULT false;
