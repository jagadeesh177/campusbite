-- Rename the STUDENT role to USER (students, teachers and all college employees who order food).
-- Every statement renames or relabels in place: no rows are deleted and all
-- users, orders, payments and relationships are preserved.

-- 1. Role enum: existing STUDENT accounts become USER automatically
ALTER TYPE "Role" RENAME VALUE 'STUDENT' TO 'USER';

-- 2. Profile table for USER accounts
ALTER TABLE "StudentProfile" RENAME TO "UserProfile";
ALTER TABLE "UserProfile" RENAME CONSTRAINT "StudentProfile_pkey" TO "UserProfile_pkey";
ALTER TABLE "UserProfile" RENAME CONSTRAINT "StudentProfile_userId_fkey" TO "UserProfile_userId_fkey";
ALTER INDEX "StudentProfile_userId_key" RENAME TO "UserProfile_userId_key";
ALTER INDEX "StudentProfile_externalStudentId_key" RENAME TO "UserProfile_externalStudentId_key";

-- 3. Realtime events addressed to one user
ALTER TABLE "RealtimeEvent" RENAME COLUMN "studentUserId" TO "forUserId";
ALTER INDEX "RealtimeEvent_studentUserId_id_idx" RENAME TO "RealtimeEvent_forUserId_id_idx";

-- 4. Role labels stored as text in history / audit rows
UPDATE "OrderStatusHistory" SET "actorRole" = 'USER' WHERE "actorRole" = 'STUDENT';
UPDATE "AuditLog" SET "actorRole" = 'USER' WHERE "actorRole" = 'STUDENT';
