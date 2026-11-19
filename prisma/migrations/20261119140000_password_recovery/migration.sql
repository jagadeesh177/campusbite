-- Password recovery: 15-minute reset windows and recovery sessions (additive).
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PasswordReset_userId_requestedAt_idx" ON "PasswordReset"("userId", "requestedAt");
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RecoverySession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passwordResetId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "passwordChanges" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecoverySession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecoverySession_tokenHash_key" ON "RecoverySession"("tokenHash");
CREATE INDEX "RecoverySession_userId_idx" ON "RecoverySession"("userId");
ALTER TABLE "RecoverySession" ADD CONSTRAINT "RecoverySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoverySession" ADD CONSTRAINT "RecoverySession_passwordResetId_fkey" FOREIGN KEY ("passwordResetId") REFERENCES "PasswordReset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
