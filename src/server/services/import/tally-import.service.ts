import { createHash } from "node:crypto";
import { NotFoundError, AppError } from "@/lib/api/errors";
import { parseTallyEnvelope } from "@/lib/import/tally/xml";
import { parseLedgers, parseStockItems } from "@/lib/import/tally/parse-masters";
import { parseVouchers } from "@/lib/import/tally/parse-vouchers";
import type {
  TallyInventoryEntry,
  TallyLedger,
  TallyStockItem,
  TallyVoucher,
} from "@/lib/import/tally/types";
import { tallyImportRepository } from "@/server/repositories/tally-import.repository";
import { partyService } from "@/server/services/party.service";
import { itemService } from "@/server/services/item.service";
import { invoiceService } from "@/server/services/invoice.service";
import { billService } from "@/server/services/bill.service";
import { stockService } from "@/server/services/stock.service";
import { createLogger } from "@/lib/logger";
import type { ImportBatch, ImportRecord } from "@/generated/prisma/client";

const log = createLogger("tally-import");

// Deviation from brief: the real `ImportSource` Prisma enum also has legacy
// `TALLY_XML`/`CSV` values (unused by this service, kept for compatibility —
// see Task 0 reconciliation note). This service only ever creates/consumes
// the three values below.
export type TallyImportSource =
  | "TALLY_MASTERS_LEDGERS"
  | "TALLY_MASTERS_STOCKITEMS"
  | "TALLY_VOUCHERS";

// Deviation from brief: real `ImportBatchStatus` has no "RUNNING" value —
// the in-flight state is "PROCESSING" (see Task 0 reconciliation note).
export interface ImportBatchDto {
  id: string;
  source: TallyImportSource;
  fileName: string | null;
  fileHash: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REVERTED";
  totalCount: number;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  erroredCount: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ImportRecordDto {
  id: string;
  entityType: string;
  entityId: string | null;
  tallyGuid: string;
  alterId: number;
  action: "CREATED" | "UPDATED" | "SKIPPED" | "ERRORED";
  message: string | null;
}

interface Counters {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
}

// DTO exposes friendlier public field names (erroredCount/error/finishedAt)
// while reading from the real Prisma column names (errorCount/errorSummary/
// completedAt) per Task 0 reconciliation note's explicit allowance.
function toBatchDto(batch: ImportBatch): ImportBatchDto {
  return {
    id: batch.id,
    source: batch.source as TallyImportSource,
    fileName: batch.fileName,
    fileHash: batch.fileHash,
    status: batch.status as ImportBatchDto["status"],
    totalCount: batch.totalCount,
    processedCount: batch.processedCount,
    createdCount: batch.createdCount,
    updatedCount: batch.updatedCount,
    skippedCount: batch.skippedCount,
    erroredCount: batch.errorCount,
    error: batch.errorSummary,
    createdAt: batch.createdAt.toISOString(),
    finishedAt: batch.completedAt?.toISOString() ?? null,
  };
}

function toRecordDto(record: ImportRecord): ImportRecordDto {
  return {
    id: record.id,
    entityType: record.recordType,
    entityId: record.entityId,
    tallyGuid: record.tallyGuid ?? "",
    alterId: record.alterId ?? 0,
    action: record.status as ImportRecordDto["action"],
    message: record.message,
  };
}

const PARTY_GROUPS: Record<string, "CUSTOMER" | "SUPPLIER"> = {
  "sundry debtors": "CUSTOMER",
  "sundry creditors": "SUPPLIER",
};

export const tallyImportService = {
  async createBatch(
    organizationId: string,
    input: { source: TallyImportSource; fileName: string; xml: string },
  ): Promise<ImportBatchDto> {
    // Fail fast on non-Tally XML before persisting anything
    parseTallyEnvelope(input.xml);

    const batch = await tallyImportRepository.createBatch({
      organizationId,
      source: input.source,
      fileName: input.fileName,
      fileHash: createHash("sha256").update(input.xml).digest("hex"),
      rawContent: input.xml,
    });
    return toBatchDto(batch);
  },

  async getBatch(organizationId: string, batchId: string): Promise<ImportBatchDto> {
    const batch = await tallyImportRepository.findBatchById(organizationId, batchId);
    if (!batch) throw new NotFoundError("Import batch not found");
    return toBatchDto(batch);
  },

  async listBatches(organizationId: string): Promise<ImportBatchDto[]> {
    const batches = await tallyImportRepository.listBatches(organizationId);
    return batches.map(toBatchDto);
  },

  async listRecords(organizationId: string, batchId: string): Promise<ImportRecordDto[]> {
    await this.getBatch(organizationId, batchId); // 404 + org check
    const records = await tallyImportRepository.listRecords(organizationId, batchId);
    return records.map(toRecordDto);
  },

  async getRecordsCsv(organizationId: string, batchId: string): Promise<string> {
    const records = await this.listRecords(organizationId, batchId);
    const escape = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = "entityType,entityId,tallyGuid,alterId,action,message";
    const rows = records.map((r) =>
      [r.entityType, r.entityId ?? "", r.tallyGuid, String(r.alterId), r.action, escape(r.message)].join(","),
    );
    return [header, ...rows].join("\n");
  },

  async runBatch(organizationId: string, batchId: string): Promise<ImportBatchDto> {
    const batch = await tallyImportRepository.findBatchById(organizationId, batchId);
    if (!batch) throw new NotFoundError("Import batch not found");
    if (batch.status === "PROCESSING") {
      throw new AppError("IMPORT_ALREADY_RUNNING", "Batch is already running", 409);
    }
    if (!batch.rawContent) {
      throw new AppError("IMPORT_NO_CONTENT", "Batch has no stored file content", 422);
    }

    const counters: Counters = { processed: 0, created: 0, updated: 0, skipped: 0, errored: 0 };
    const flush = (extra: Record<string, unknown> = {}) =>
      tallyImportRepository.updateBatch(organizationId, batchId, {
        processedCount: counters.processed,
        createdCount: counters.created,
        updatedCount: counters.updated,
        skippedCount: counters.skipped,
        errorCount: counters.errored,
        ...extra,
      });

    try {
      const source = batch.source as TallyImportSource;
      if (source === "TALLY_MASTERS_LEDGERS") {
        const { records, warnings } = parseLedgers(batch.rawContent);
        await flush({ status: "PROCESSING", startedAt: new Date(), totalCount: records.length });
        await recordParseWarnings(organizationId, batchId, "Party", warnings, counters);
        await importLedgers(organizationId, batchId, records, counters, flush);
      } else if (source === "TALLY_MASTERS_STOCKITEMS") {
        const { records, warnings } = parseStockItems(batch.rawContent);
        await flush({ status: "PROCESSING", startedAt: new Date(), totalCount: records.length });
        await recordParseWarnings(organizationId, batchId, "Item", warnings, counters);
        await importStockItems(organizationId, batchId, records, counters, flush);
      } else {
        const { records, warnings } = parseVouchers(batch.rawContent);
        await flush({ status: "PROCESSING", startedAt: new Date(), totalCount: records.length });
        await recordParseWarnings(organizationId, batchId, "Voucher", warnings, counters);
        await importVouchers(organizationId, batchId, records, counters, flush); // Tasks 7-8
      }

      const finished = await flush({ status: "COMPLETED", completedAt: new Date() });
      return toBatchDto(finished);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";
      log.error("Import batch failed", { batchId, message });
      const failed = await flush({ status: "FAILED", errorSummary: message, completedAt: new Date() });
      return toBatchDto(failed);
    }
  },

  async undoBatch(
    _organizationId: string,
    _actorUserId: string,
    _batchId: string,
  ): Promise<ImportBatchDto> {
    // Implemented in Task 9
    throw new AppError("NOT_IMPLEMENTED", "undoBatch lands in Task 9", 501);
  },
};

/** Parser warnings become ERRORED ImportRecords so nothing is silently dropped. */
async function recordParseWarnings(
  organizationId: string,
  batchId: string,
  recordType: string,
  warnings: { path: string; message: string }[],
  counters: Counters,
) {
  for (const warning of warnings) {
    counters.errored += 1;
    await tallyImportRepository.createRecord({
      organizationId,
      batchId,
      recordType,
      entityId: null,
      tallyGuid: null,
      alterId: 0,
      status: "ERRORED",
      message: `${warning.path}: ${warning.message}`,
    });
  }
}

const FLUSH_EVERY = 25;

async function importLedgers(
  organizationId: string,
  batchId: string,
  ledgers: TallyLedger[],
  counters: Counters,
  flush: () => Promise<unknown>,
) {
  for (const ledger of ledgers) {
    counters.processed += 1;
    const partyType = PARTY_GROUPS[ledger.parent.trim().toLowerCase()];
    try {
      if (!partyType) {
        counters.skipped += 1;
        await tallyImportRepository.createRecord({
          organizationId,
          batchId,
          recordType: "Party",
          entityId: null,
          tallyGuid: ledger.guid,
          alterId: ledger.alterId,
          status: "SKIPPED",
          message: `Ledger group "${ledger.parent}" is not a party group`,
        });
        continue;
      }

      const existing = await tallyImportRepository.findPartyByGuid(organizationId, ledger.guid);
      // Field-name mapping: parser's `address`/`creditPeriodDays` -> service's
      // `billingAddress`/`creditDays` (see createPartySchema in
      // src/lib/validations/party.ts).
      const input = {
        name: ledger.name,
        type: partyType,
        email: ledger.email,
        phone: ledger.phone,
        gstin: ledger.gstin,
        billingAddress: ledger.address,
        creditDays: ledger.creditPeriodDays,
        tallyGuid: ledger.guid,
        tallyAlterId: ledger.alterId,
      };

      if (!existing) {
        const created = await partyService.create(organizationId, input);
        counters.created += 1;
        await tallyImportRepository.createRecord({
          organizationId,
          batchId,
          recordType: "Party",
          entityId: created.id,
          tallyGuid: ledger.guid,
          alterId: ledger.alterId,
          status: "CREATED",
        });
      } else if ((existing.tallyAlterId ?? 0) >= ledger.alterId) {
        counters.skipped += 1;
        await tallyImportRepository.createRecord({
          organizationId,
          batchId,
          recordType: "Party",
          entityId: existing.id,
          tallyGuid: ledger.guid,
          alterId: ledger.alterId,
          status: "SKIPPED",
          message: "Unchanged (ALTERID not newer)",
        });
      } else {
        await partyService.update(organizationId, existing.id, input);
        counters.updated += 1;
        await tallyImportRepository.createRecord({
          organizationId,
          batchId,
          recordType: "Party",
          entityId: existing.id,
          tallyGuid: ledger.guid,
          alterId: ledger.alterId,
          status: "UPDATED",
          beforeJson: JSON.parse(JSON.stringify(existing)),
        });
      }
    } catch (error) {
      counters.errored += 1;
      await tallyImportRepository.createRecord({
        organizationId,
        batchId,
        recordType: "Party",
        entityId: null,
        tallyGuid: ledger.guid,
        alterId: ledger.alterId,
        status: "ERRORED",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    if (counters.processed % FLUSH_EVERY === 0) await flush();
  }
}

async function importStockItems(
  organizationId: string,
  batchId: string,
  items: TallyStockItem[],
  counters: Counters,
  flush: () => Promise<unknown>,
) {
  for (const item of items) {
    counters.processed += 1;
    try {
      const existing = await tallyImportRepository.findItemByGuid(organizationId, item.guid);
      // Field-name mapping: parser's `openingRate` -> service's
      // `purchasePrice` (see createItemSchema in src/lib/validations/item.ts).
      const input = {
        name: item.name,
        unit: item.unit,
        hsnCode: item.hsnCode,
        gstRate: item.gstRate,
        openingQty: item.openingQty,
        purchasePrice: item.openingRate,
        tallyGuid: item.guid,
        tallyAlterId: item.alterId,
      };

      if (!existing) {
        const created = await itemService.create(organizationId, input);
        counters.created += 1;
        await tallyImportRepository.createRecord({
          organizationId,
          batchId,
          recordType: "Item",
          entityId: created.id,
          tallyGuid: item.guid,
          alterId: item.alterId,
          status: "CREATED",
        });
      } else if ((existing.tallyAlterId ?? 0) >= item.alterId) {
        counters.skipped += 1;
        await tallyImportRepository.createRecord({
          organizationId,
          batchId,
          recordType: "Item",
          entityId: existing.id,
          tallyGuid: item.guid,
          alterId: item.alterId,
          status: "SKIPPED",
          message: "Unchanged (ALTERID not newer)",
        });
      } else {
        await itemService.update(organizationId, existing.id, input);
        counters.updated += 1;
        await tallyImportRepository.createRecord({
          organizationId,
          batchId,
          recordType: "Item",
          entityId: existing.id,
          tallyGuid: item.guid,
          alterId: item.alterId,
          status: "UPDATED",
          beforeJson: JSON.parse(JSON.stringify(existing)),
        });
      }
    } catch (error) {
      counters.errored += 1;
      await tallyImportRepository.createRecord({
        organizationId,
        batchId,
        recordType: "Item",
        entityId: null,
        tallyGuid: item.guid,
        alterId: item.alterId,
        status: "ERRORED",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    if (counters.processed % FLUSH_EVERY === 0) await flush();
  }
}

/**
 * Finds (or stub-creates) the Party for a voucher's PARTYLEDGERNAME.
 * Returns the party's id and creditDays (needed for dueDate) in one call —
 * whether the party already existed or had to be created — plus an optional
 * note for the ImportRecord message when a stub party was created.
 */
async function resolveParty(
  organizationId: string,
  name: string,
  fallbackType: "CUSTOMER" | "SUPPLIER",
): Promise<{ partyId: string; creditDays: number | null; note?: string }> {
  const existing = await tallyImportRepository.findPartyByName(organizationId, name);
  if (existing) return { partyId: existing.id, creditDays: existing.creditDays };

  const created = await partyService.create(organizationId, { name, type: fallbackType });
  return {
    partyId: created.id,
    creditDays: created.creditDays,
    note: `Created stub ${fallbackType.toLowerCase()} party "${name}" — fill in email/phone before chasing`,
  };
}

/** The party ledger entry carries the document total (Tally sign: debit negative). */
function voucherTotal(voucher: TallyVoucher): number {
  const party = voucher.ledgerEntries.find((e) => e.isPartyLedger);
  if (party) return Math.abs(party.amount);
  return voucher.inventoryEntries.reduce((sum, e) => sum + e.amount, 0);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds Invoice line items from a Sales voucher's inventory entries. An
 * unmatched stock item name doesn't fail the import (warnings, not
 * failures) — the line is kept without an itemId and a note is pushed for
 * the ImportRecord message.
 */
async function buildLineItems(
  organizationId: string,
  entries: TallyInventoryEntry[],
  notes: string[],
) {
  const lineItems = [];
  for (const entry of entries) {
    const item = await tallyImportRepository.findItemByName(organizationId, entry.stockItemName);
    if (!item) notes.push(`Unknown stock item "${entry.stockItemName}" — line kept without item link`);
    lineItems.push({
      itemId: item?.id ?? undefined,
      description: entry.stockItemName,
      quantity: entry.quantity,
      rate: entry.rate,
      amount: entry.amount,
    });
  }
  return lineItems;
}

/**
 * Records one StockMovement per inventory entry whose stock item matched an
 * existing Item (an unmatched item was already noted by buildLineItems, so
 * it's silently skipped here — there's nothing to move stock against).
 */
async function recordVoucherStock(
  organizationId: string,
  entries: TallyInventoryEntry[],
  direction: 1 | -1,
  sourceType: "INVOICE" | "BILL",
  sourceId: string,
) {
  for (const entry of entries) {
    const item = await tallyImportRepository.findItemByName(organizationId, entry.stockItemName);
    if (!item) continue;
    await stockService.recordMovement(organizationId, {
      itemId: item.id,
      qty: direction * entry.quantity,
      rate: entry.rate,
      sourceType,
      sourceId,
    });
  }
}

async function importVouchers(
  organizationId: string,
  batchId: string,
  vouchers: TallyVoucher[],
  counters: Counters,
  flush: () => Promise<unknown>,
): Promise<void> {
  for (const voucher of vouchers) {
    counters.processed += 1;
    try {
      switch (voucher.kind) {
        case "SALES":
          await importSalesVoucher(organizationId, batchId, voucher, counters);
          break;
        case "PURCHASE":
          await importPurchaseVoucher(organizationId, batchId, voucher, counters);
          break;
        case "RECEIPT":
        case "PAYMENT":
        case "CREDIT_NOTE":
        case "DEBIT_NOTE":
          await importMoneyVoucher(organizationId, batchId, voucher, counters); // Task 8
          break;
        default: {
          counters.skipped += 1;
          await tallyImportRepository.createRecord({
            organizationId,
            batchId,
            recordType: "Voucher",
            entityId: null,
            tallyGuid: voucher.guid,
            alterId: voucher.alterId,
            status: "SKIPPED",
            message: `Unsupported voucher type "${voucher.voucherTypeName}"`,
          });
        }
      }
    } catch (error) {
      counters.errored += 1;
      await tallyImportRepository.createRecord({
        organizationId,
        batchId,
        recordType: "Voucher",
        entityId: null,
        tallyGuid: voucher.guid,
        alterId: voucher.alterId,
        status: "ERRORED",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    if (counters.processed % FLUSH_EVERY === 0) await flush();
  }
}

async function importSalesVoucher(
  organizationId: string,
  batchId: string,
  voucher: TallyVoucher,
  counters: Counters,
) {
  const notes: string[] = [];
  const existing = await tallyImportRepository.findInvoiceByGuid(organizationId, voucher.guid);
  if (existing && (existing.tallyAlterId ?? 0) >= voucher.alterId) {
    counters.skipped += 1;
    await tallyImportRepository.createRecord({
      organizationId,
      batchId,
      recordType: "Invoice",
      entityId: existing.id,
      tallyGuid: voucher.guid,
      alterId: voucher.alterId,
      status: "SKIPPED",
      message: "Unchanged (ALTERID not newer)",
    });
    return;
  }

  const { partyId, creditDays, note } = await resolveParty(
    organizationId,
    voucher.partyLedgerName,
    "CUSTOMER",
  );
  if (note) notes.push(note);
  const dueDate = addDays(voucher.date, creditDays ?? 0);
  const lineItems = await buildLineItems(organizationId, voucher.inventoryEntries, notes);

  // `tallyAlterId` is deliberately withheld from this input and only
  // stamped in a final update once stock recording has succeeded below —
  // see the comment on each branch for why.
  const input = {
    type: "RECEIVABLE" as const,
    partyId,
    clientName: voucher.partyLedgerName,
    invoiceNumber: voucher.voucherNumber,
    amount: voucherTotal(voucher),
    dueDate,
    notes: voucher.narration,
    tallyGuid: voucher.guid,
    lineItems,
  };

  if (!existing) {
    // Stamp tallyGuid immediately (so a retry after a mid-sequence failure
    // finds this row instead of creating a duplicate) but withhold
    // tallyAlterId until recordVoucherStock succeeds. If recordVoucherStock
    // throws, tallyAlterId stays unset, so a retry falls into the `existing`
    // branch below (treated as an update) instead of being permanently
    // skipped by the tallyAlterId >= check.
    const created = await invoiceService.create(organizationId, input);
    await recordVoucherStock(organizationId, voucher.inventoryEntries, -1, "INVOICE", created.id);
    await invoiceService.update(organizationId, created.id, { tallyAlterId: voucher.alterId });
    counters.created += 1;
    await tallyImportRepository.createRecord({
      organizationId,
      batchId,
      recordType: "Invoice",
      entityId: created.id,
      tallyGuid: voucher.guid,
      alterId: voucher.alterId,
      status: "CREATED",
      message: notes.length ? notes.join("; ") : undefined,
    });
  } else {
    // Same idea as the create branch: update content/lineItems first, run
    // stock replace+record, and only bump tallyAlterId to the new value
    // once those side effects have succeeded. A mid-sequence failure leaves
    // existing.tallyAlterId at its old (lower) value, so the voucher stays
    // re-importable on retry instead of being skipped forever.
    await invoiceService.update(organizationId, existing.id, input); // replaces lineItems
    await stockService.replaceMovementsForSource(organizationId, "INVOICE", existing.id);
    await recordVoucherStock(organizationId, voucher.inventoryEntries, -1, "INVOICE", existing.id);
    await invoiceService.update(organizationId, existing.id, { tallyAlterId: voucher.alterId });
    counters.updated += 1;
    await tallyImportRepository.createRecord({
      organizationId,
      batchId,
      recordType: "Invoice",
      entityId: existing.id,
      tallyGuid: voucher.guid,
      alterId: voucher.alterId,
      status: "UPDATED",
      message: notes.length ? notes.join("; ") : undefined,
      beforeJson: JSON.parse(JSON.stringify(existing)),
    });
  }
}

/**
 * Mirror of importSalesVoucher for Purchase vouchers. Bill has no
 * line-item relation in the schema (only Invoice does) — see the Task 0
 * reconciliation note's "Bill — no line items exist on the model at all".
 * Scope decision: a Purchase voucher creates/updates a Bill with only the
 * aggregate amount/dueDate/notes/tallyGuid/tallyAlterId; the voucher's
 * inventory detail is still fully captured via one StockMovement (IN) per
 * entry, exactly as for Sales/stock-OUT. No BillLineItem model is added —
 * nothing would consume it (YAGNI).
 */
async function importPurchaseVoucher(
  organizationId: string,
  batchId: string,
  voucher: TallyVoucher,
  counters: Counters,
) {
  const notes: string[] = [];
  const existing = await tallyImportRepository.findBillByGuid(organizationId, voucher.guid);
  if (existing && (existing.tallyAlterId ?? 0) >= voucher.alterId) {
    counters.skipped += 1;
    await tallyImportRepository.createRecord({
      organizationId,
      batchId,
      recordType: "Bill",
      entityId: existing.id,
      tallyGuid: voucher.guid,
      alterId: voucher.alterId,
      status: "SKIPPED",
      message: "Unchanged (ALTERID not newer)",
    });
    return;
  }

  const { partyId, creditDays, note } = await resolveParty(
    organizationId,
    voucher.partyLedgerName,
    "SUPPLIER",
  );
  if (note) notes.push(note);
  const dueDate = addDays(voucher.date, creditDays ?? 0);
  // Line items aren't persisted for Bill (no relation) — buildLineItems is
  // still used to collect "unknown stock item" notes and validate matches
  // the same way Sales does, but its result is discarded.
  await buildLineItems(organizationId, voucher.inventoryEntries, notes);

  // `tallyAlterId` is deliberately withheld from this input and only
  // stamped in a final update once stock recording has succeeded below —
  // see the comment on each branch for why (mirrors importSalesVoucher).
  const input = {
    partyId,
    billNumber: voucher.voucherNumber,
    amount: voucherTotal(voucher),
    dueDate,
    notes: voucher.narration,
    tallyGuid: voucher.guid,
  };

  if (!existing) {
    // Stamp tallyGuid immediately (so a retry after a mid-sequence failure
    // finds this row instead of creating a duplicate) but withhold
    // tallyAlterId until recordVoucherStock succeeds. If recordVoucherStock
    // throws, tallyAlterId stays unset, so a retry falls into the `existing`
    // branch below (treated as an update) instead of being permanently
    // skipped by the tallyAlterId >= check.
    const created = await billService.create(organizationId, input);
    await recordVoucherStock(organizationId, voucher.inventoryEntries, 1, "BILL", created.id);
    await billService.update(organizationId, created.id, { tallyAlterId: voucher.alterId });
    counters.created += 1;
    await tallyImportRepository.createRecord({
      organizationId,
      batchId,
      recordType: "Bill",
      entityId: created.id,
      tallyGuid: voucher.guid,
      alterId: voucher.alterId,
      status: "CREATED",
      message: notes.length ? notes.join("; ") : undefined,
    });
  } else {
    // Same idea as the create branch: update content first, run stock
    // replace+record, and only bump tallyAlterId to the new value once
    // those side effects have succeeded. A mid-sequence failure leaves
    // existing.tallyAlterId at its old (lower) value, so the voucher stays
    // re-importable on retry instead of being skipped forever.
    await billService.update(organizationId, existing.id, input);
    await stockService.replaceMovementsForSource(organizationId, "BILL", existing.id);
    await recordVoucherStock(organizationId, voucher.inventoryEntries, 1, "BILL", existing.id);
    await billService.update(organizationId, existing.id, { tallyAlterId: voucher.alterId });
    counters.updated += 1;
    await tallyImportRepository.createRecord({
      organizationId,
      batchId,
      recordType: "Bill",
      entityId: existing.id,
      tallyGuid: voucher.guid,
      alterId: voucher.alterId,
      status: "UPDATED",
      message: notes.length ? notes.join("; ") : undefined,
      beforeJson: JSON.parse(JSON.stringify(existing)),
    });
  }
}

// importMoneyVoucher (Receipt/Payment/Credit Note/Debit Note) lands in
// Task 8; declared here so importVouchers compiles. The outer try/catch in
// importVouchers turns this into an ERRORED record for now.
async function importMoneyVoucher(
  _organizationId: string,
  _batchId: string,
  _voucher: TallyVoucher,
  _counters: Counters,
): Promise<void> {
  throw new AppError("NOT_IMPLEMENTED", "Money voucher import lands in Task 8", 501);
}
