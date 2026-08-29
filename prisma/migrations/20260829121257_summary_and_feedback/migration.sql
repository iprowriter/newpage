-- CreateEnum
CREATE TYPE "Feedback" AS ENUM ('up', 'down');

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryFingerprint" TEXT;

-- AlterTable
ALTER TABLE "QueryTrace" ADD COLUMN     "feedback" "Feedback",
ADD COLUMN     "feedbackAt" TIMESTAMP(3),
ADD COLUMN     "feedbackNote" TEXT;

-- CreateIndex
CREATE INDEX "QueryTrace_feedback_createdAt_idx" ON "QueryTrace"("feedback", "createdAt");
