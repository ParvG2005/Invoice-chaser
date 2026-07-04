-- AlterEnum
ALTER TYPE "EmailTone" ADD VALUE 'FINAL_NOTICE';

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- AlterTable
ALTER TABLE "communication_logs" ADD COLUMN "direction" "CommunicationDirection" NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN "delivered_at" TIMESTAMP(3),
ADD COLUMN "read_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reminder_settings" ADD COLUMN "enabled_channels" "Channel"[] DEFAULT ARRAY['EMAIL']::"Channel"[],
ADD COLUMN "quiet_hours_start" TEXT,
ADD COLUMN "quiet_hours_end" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
ADD COLUMN "escalation_tones" "EmailTone"[] DEFAULT ARRAY['FRIENDLY', 'PROFESSIONAL', 'FIRM', 'FINAL_NOTICE']::"EmailTone"[],
ADD COLUMN "upi_id" TEXT,
ADD COLUMN "payment_link" TEXT;

-- AlterTable
ALTER TABLE "parties" ADD COLUMN "preferred_channels" "Channel"[] DEFAULT ARRAY[]::"Channel"[],
ADD COLUMN "email_opt_out_at" TIMESTAMP(3),
ADD COLUMN "whatsapp_opt_out_at" TIMESTAMP(3);

-- Seed enabledChannels from legacy whatsapp_enabled flag
UPDATE "reminder_settings"
SET "enabled_channels" = ARRAY['EMAIL','WHATSAPP']::"Channel"[]
WHERE "whatsapp_enabled" = true;
