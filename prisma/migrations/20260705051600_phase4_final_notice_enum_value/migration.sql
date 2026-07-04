-- AlterEnum
-- New enum values cannot be used in the same transaction that adds them, so
-- this migration ONLY adds the value; the migration that references it
-- (20260705051610_phase4_communications) runs after this one has committed.
-- Mirrors the split used in 20260704130550_phase3_invoice_status_partial_writtenoff.
ALTER TYPE "EmailTone" ADD VALUE 'FINAL_NOTICE';
