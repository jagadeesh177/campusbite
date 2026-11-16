-- Remove tables from the old college-email activation (replaced by Supabase Auth).
-- They hold only expired one-time codes/links and development test emails — no orders,
-- payments or account data.
DROP TABLE IF EXISTS "StudentAccessToken";
DROP TABLE IF EXISTS "VerificationCode";
DROP TABLE IF EXISTS "DevMailMessage";
DROP TYPE IF EXISTS "StudentTokenPurpose";
DROP TYPE IF EXISTS "VerificationPurpose";
