-- CreateEnum
CREATE TYPE "StudentTokenPurpose" AS ENUM ('ACTIVATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "StudentAccessToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "StudentTokenPurpose" NOT NULL,
    "email" TEXT NOT NULL,
    "externalStudentId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentAccessToken_tokenHash_key" ON "StudentAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "StudentAccessToken_email_purpose_idx" ON "StudentAccessToken"("email", "purpose");
