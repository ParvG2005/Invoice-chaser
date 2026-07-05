-- Phase 6 (AI Assistant) session-level model tier selection was accepted by
-- createSession but never persisted, so a session could never actually be
-- routed to a non-default model. Persist the chosen tier on the session.

-- AlterTable
ALTER TABLE "assistant_sessions" ADD COLUMN "model_tier" TEXT NOT NULL DEFAULT 'default';
