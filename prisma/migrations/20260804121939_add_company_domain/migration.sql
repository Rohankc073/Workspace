/*
  Warnings:

  - A unique constraint covering the columns `[domain]` on the table `Company` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `domain` to the `Company` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "domain" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");
