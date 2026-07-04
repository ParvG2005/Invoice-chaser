-- This migration runs after 20260705051600_phase4_final_notice_enum_value has
-- committed, so it is safe to reference the 'FINAL_NOTICE' EmailTone value
-- added there in the escalation_tones column default below.

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- AlterTable
ALTER TABLE "communication_logs" ADD COLUMN "direction" "CommunicationDirection" NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN "delivered_at" TIMESTAMP(3),
ADD COLUMN "read_at" TIMESTAMP(3);

-- AlterTable
-- Reuses the existing "CommunicationChannel" enum (Phase 1) instead of
-- creating a duplicate "Channel" enum.
ALTER TABLE "reminder_settings" ADD COLUMN "enabled_channels" "CommunicationChannel"[] DEFAULT ARRAY['EMAIL']::"CommunicationChannel"[],
ADD COLUMN "quiet_hours_start" TEXT,
ADD COLUMN "quiet_hours_end" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
ADD COLUMN "escalation_tones" "EmailTone"[] DEFAULT ARRAY['FRIENDLY', 'PROFESSIONAL', 'FIRM', 'FINAL_NOTICE']::"EmailTone"[],
ADD COLUMN "upi_id" TEXT,
ADD COLUMN "payment_link" TEXT;

-- AlterTable
ALTER TABLE "parties" ADD COLUMN "preferred_channels" "CommunicationChannel"[] DEFAULT ARRAY[]::"CommunicationChannel"[],
ADD COLUMN "email_opt_out_at" TIMESTAMP(3),
ADD COLUMN "whatsapp_opt_out_at" TIMESTAMP(3);

-- Seed enabledChannels from legacy whatsapp_enabled flag
UPDATE "reminder_settings"
SET "enabled_channels" = ARRAY['EMAIL','WHATSAPP']::"CommunicationChannel"[]
WHERE "whatsapp_enabled" = true;
