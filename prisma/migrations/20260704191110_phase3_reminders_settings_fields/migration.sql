-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "address_line1" TEXT,
ADD COLUMN     "address_line2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "email_signature" TEXT,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "sender_name" TEXT,
ADD COLUMN     "sender_reply_to" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "theme" TEXT DEFAULT 'system';

-- AlterTable
ALTER TABLE "reminder_settings" ADD COLUMN     "quiet_hours" JSONB,
ADD COLUMN     "sequence" JSONB;
