-- Self-registered students are linked to a Supabase Auth user
ALTER TABLE "User" ADD COLUMN "supabaseUserId" TEXT;
CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");

-- College student ID is only kept for legacy college-verified students
ALTER TABLE "StudentProfile" ALTER COLUMN "externalStudentId" DROP NOT NULL;
ALTER TABLE "StudentProfile" ALTER COLUMN "integrationSource" SET DEFAULT 'supabase';
