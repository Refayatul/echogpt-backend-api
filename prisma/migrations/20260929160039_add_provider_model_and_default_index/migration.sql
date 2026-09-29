-- AlterTable
ALTER TABLE "AiProvider" ADD COLUMN     "model" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "AiProvider_userId_isDefault_idx" ON "AiProvider"("userId", "isDefault");
