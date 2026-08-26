-- AlterTable
ALTER TABLE "FileVersion" ADD COLUMN     "changesKey" TEXT,
ADD COLUMN     "changesSummary" JSONB,
ADD COLUMN     "serverVersion" TEXT;
