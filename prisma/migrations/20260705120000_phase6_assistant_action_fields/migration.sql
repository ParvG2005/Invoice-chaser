-- Phase 6 (AI Assistant) approval loop needs a human-readable diff summary
-- persisted on the proposed action, and reviewer feedback captured on
-- rejection. `approved_by_id` already existed (Phase 1 scaffold) and is
-- reused as-is; only the Prisma field name changes (approvedById -> approvedBy).

-- AlterTable
ALTER TABLE "assistant_actions" ADD COLUMN "diff_summary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "assistant_actions" ADD COLUMN "reject_feedback" TEXT;
