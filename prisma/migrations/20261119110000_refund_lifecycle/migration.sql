-- Accurate refund lifecycle (additive; no rows deleted).
-- Old values: PENDING = not yet sent, PROCESSING = sent and awaiting Razorpay.
-- New: NOT_REQUESTED, REQUESTED, PROCESSING, PROCESSED (Razorpay confirmed),
--      CREDITED (bank credit confirmed by staff), FAILED, REVERSED.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'RefundStatus' AND e.enumlabel = 'NOT_REQUESTED') THEN
    ALTER TYPE "RefundStatus" RENAME VALUE 'PENDING' TO 'NOT_REQUESTED';
  ELSIF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'RefundStatus' AND e.enumlabel = 'PENDING') THEN
    -- development databases that ran an earlier draft of this change
    ALTER TYPE "RefundStatus" RENAME VALUE 'PENDING' TO 'PROCESSING';
  END IF;
END $$;
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'REQUESTED' AFTER 'NOT_REQUESTED';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'PROCESSING' AFTER 'REQUESTED';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'CREDITED' AFTER 'PROCESSED';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'REVERSED';
ALTER TABLE "Refund" ALTER COLUMN "status" SET DEFAULT 'NOT_REQUESTED';

ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "speedRequested" TEXT;
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "speedProcessed" TEXT;
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "bankReference" TEXT;
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMP(3);
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "checkedAt" TIMESTAMP(3);
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "creditedAt" TIMESTAMP(3);
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "creditConfirmedById" TEXT;
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "creditEvidence" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Refund_creditConfirmedById_fkey') THEN
    ALTER TABLE "Refund" ADD CONSTRAINT "Refund_creditConfirmedById_fkey" FOREIGN KEY ("creditConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "Refund" SET "requestedAt" = "createdAt" WHERE "requestedAt" IS NULL AND "status" IN ('PROCESSED', 'FAILED');

-- Orders were marked REFUNDED when Razorpay processed the refund, which does not
-- prove the customer's bank was credited. Put them back to "refund in progress";
-- staff confirm the bank credit to make them REFUNDED again.
UPDATE "Order" o SET "status" = 'REFUND_PENDING'
WHERE o."status" = 'REFUNDED'
  AND EXISTS (SELECT 1 FROM "Refund" r WHERE r."orderId" = o."id" AND r."status" = 'PROCESSED');
