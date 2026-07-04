-- AlterEnum
ALTER TYPE "ImportSource" ADD VALUE 'TALLY_MASTERS_LEDGERS';
ALTER TYPE "ImportSource" ADD VALUE 'TALLY_MASTERS_STOCKITEMS';
ALTER TYPE "ImportSource" ADD VALUE 'TALLY_VOUCHERS';

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "total_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processed_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "raw_content" TEXT;

-- AlterTable
ALTER TABLE "import_records" ADD COLUMN     "before_json" JSONB,
ALTER COLUMN "alter_id" SET DATA TYPE INTEGER USING ("alter_id"::INTEGER);

-- AlterTable
ALTER TABLE "parties" ADD COLUMN     "tally_alter_id" INTEGER;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "tally_alter_id" INTEGER;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "tally_alter_id" INTEGER;

-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "tally_alter_id" INTEGER;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "tally_alter_id" INTEGER;
