import type {
  Bill,
  ImportBatch,
  ImportRecord,
  ImportRecordStatus,
  ImportSource,
  Invoice,
  Item,
  Party,
  Payment,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export const tallyImportRepository = {
  createBatch(data: {
    organizationId: string;
    source: ImportSource;
    fileName: string;
    fileHash: string;
    rawContent: string;
  }): Promise<ImportBatch> {
    return prisma.importBatch.create({
      data: { ...data, status: "PENDING" },
    });
  },

  findBatchById(organizationId: string, id: string): Promise<ImportBatch | null> {
    return prisma.importBatch.findFirst({ where: { id, organizationId, deletedAt: null } });
  },

  listBatches(organizationId: string, take = 50): Promise<ImportBatch[]> {
    return prisma.importBatch.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take,
    });
  },

  updateBatch(
    organizationId: string,
    id: string,
    data: Prisma.ImportBatchUpdateInput,
  ): Promise<ImportBatch> {
    return prisma.importBatch.update({
      where: { id, organizationId, deletedAt: null },
      data,
    });
  },

  createRecord(data: {
    organizationId: string;
    batchId: string;
    recordType: string;
    entityId: string | null;
    tallyGuid: string | null;
    alterId: number;
    status: ImportRecordStatus;
    message?: string;
    beforeJson?: Prisma.InputJsonValue;
  }): Promise<ImportRecord> {
    return prisma.importRecord.create({ data });
  },

  listRecords(organizationId: string, batchId: string): Promise<ImportRecord[]> {
    return prisma.importRecord.findMany({
      where: { organizationId, batchId },
      orderBy: { createdAt: "asc" },
    });
  },

  findPartyByGuid(organizationId: string, tallyGuid: string): Promise<Party | null> {
    return prisma.party.findFirst({ where: { organizationId, tallyGuid, deletedAt: null } });
  },
  findPartyByName(organizationId: string, name: string): Promise<Party | null> {
    return prisma.party.findFirst({ where: { organizationId, name, deletedAt: null } });
  },
  findItemByGuid(organizationId: string, tallyGuid: string): Promise<Item | null> {
    return prisma.item.findFirst({ where: { organizationId, tallyGuid, deletedAt: null } });
  },
  findItemByName(organizationId: string, name: string): Promise<Item | null> {
    return prisma.item.findFirst({ where: { organizationId, name, deletedAt: null } });
  },
  findInvoiceByGuid(organizationId: string, tallyGuid: string): Promise<Invoice | null> {
    return prisma.invoice.findFirst({ where: { organizationId, tallyGuid, deletedAt: null } });
  },
  findInvoiceByNumber(organizationId: string, invoiceNumber: string): Promise<Invoice | null> {
    return prisma.invoice.findFirst({
      where: { organizationId, invoiceNumber, deletedAt: null },
    });
  },
  findBillByGuid(organizationId: string, tallyGuid: string): Promise<Bill | null> {
    return prisma.bill.findFirst({ where: { organizationId, tallyGuid, deletedAt: null } });
  },
  findBillByNumber(organizationId: string, billNumber: string): Promise<Bill | null> {
    return prisma.bill.findFirst({ where: { organizationId, billNumber, deletedAt: null } });
  },
  findPaymentByGuid(organizationId: string, tallyGuid: string): Promise<Payment | null> {
    return prisma.payment.findFirst({ where: { organizationId, tallyGuid, deletedAt: null } });
  },

  /**
   * Soft-deletes an imported entity and its dependent rows (allocations,
   * stock movements, line items) inside one transaction. Payments reverse
   * their allocations' effect on the target document's amountPaid/status
   * before soft-deleting the allocation, mirroring (in reverse)
   * `applyAllocation` in payment.repository.ts.
   */
  async softDeleteEntity(
    organizationId: string,
    entityType: "Party" | "Item" | "Invoice" | "Bill" | "Payment",
    entityId: string,
  ): Promise<void> {
    const now = new Date();
    switch (entityType) {
      case "Payment": {
        await prisma.$transaction(async (tx) => {
          const allocations = await tx.paymentAllocation.findMany({
            where: { organizationId, paymentId: entityId, deletedAt: null },
          });

          for (const allocation of allocations) {
            const amount = Number(allocation.amount);
            if (allocation.invoiceId) {
              const current = await tx.invoice.findFirst({
                where: { id: allocation.invoiceId, organizationId, deletedAt: null },
              });
              if (current) {
                const newAmountPaid = Number(current.amountPaid) - amount;
                const total = Number(current.totalAmount ?? current.amount);
                await tx.invoice.updateMany({
                  where: { id: allocation.invoiceId, organizationId, deletedAt: null },
                  data: {
                    amountPaid: { decrement: amount },
                    ...(current.status === "PAID" && newAmountPaid < total
                      ? { status: "PENDING", paidAt: null }
                      : {}),
                  },
                });
              }
            } else if (allocation.billId) {
              const current = await tx.bill.findFirst({
                where: { id: allocation.billId, organizationId, deletedAt: null },
              });
              if (current) {
                const newAmountPaid = Number(current.amountPaid) - amount;
                const total = Number(current.amount);
                await tx.bill.updateMany({
                  where: { id: allocation.billId, organizationId, deletedAt: null },
                  data: {
                    amountPaid: { decrement: amount },
                    ...(current.status === "PAID" && newAmountPaid < total
                      ? { status: "PENDING", paidAt: null }
                      : {}),
                  },
                });
              }
            }

            await tx.paymentAllocation.update({
              where: { id: allocation.id },
              data: { deletedAt: now },
            });
          }

          await tx.stockMovement.updateMany({
            where: {
              organizationId,
              sourceType: "ADJUSTMENT",
              sourceId: entityId,
              deletedAt: null,
            },
            data: { deletedAt: now },
          });

          await tx.payment.update({
            where: { id: entityId, organizationId },
            data: { deletedAt: now },
          });
        });
        break;
      }
      case "Invoice": {
        await prisma.$transaction(async (tx) => {
          await tx.invoiceLineItem.updateMany({
            where: { organizationId, invoiceId: entityId, deletedAt: null },
            data: { deletedAt: now },
          });
          await tx.stockMovement.updateMany({
            where: { organizationId, sourceType: "INVOICE", sourceId: entityId, deletedAt: null },
            data: { deletedAt: now },
          });
          await tx.invoice.update({
            where: { id: entityId, organizationId },
            data: { deletedAt: now },
          });
        });
        break;
      }
      case "Bill": {
        await prisma.$transaction(async (tx) => {
          await tx.stockMovement.updateMany({
            where: { organizationId, sourceType: "BILL", sourceId: entityId, deletedAt: null },
            data: { deletedAt: now },
          });
          await tx.bill.update({
            where: { id: entityId, organizationId },
            data: { deletedAt: now },
          });
        });
        break;
      }
      case "Party": {
        await prisma.party.update({ where: { id: entityId, organizationId }, data: { deletedAt: now } });
        break;
      }
      case "Item": {
        await prisma.item.update({ where: { id: entityId, organizationId }, data: { deletedAt: now } });
        break;
      }
    }
  },

  /**
   * Writes an UPDATED record's `beforeJson` snapshot back onto the entity.
   * The snapshot is the full raw Prisma row (via JSON.parse(JSON.stringify(row))),
   * so relation arrays, ids, org id, and timestamps must be stripped before
   * the write — only real scalar columns on the model are passed through.
   */
  async restoreEntitySnapshot(
    organizationId: string,
    entityType: "Party" | "Item" | "Invoice" | "Bill" | "Payment",
    entityId: string,
    snapshot: Record<string, unknown>,
  ): Promise<void> {
    const { id, organizationId: _orgId, createdAt, updatedAt, deletedAt, ...rest } = snapshot;
    void id;
    void _orgId;
    void createdAt;
    void updatedAt;
    void deletedAt;

    // Strip relation arrays (e.g. lineItems, allocations) — snapshots are
    // taken before any relation is loaded, but guard defensively anyway.
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (Array.isArray(value)) continue;
      data[key] = value;
    }

    switch (entityType) {
      case "Party":
        await prisma.party.update({ where: { id: entityId, organizationId }, data });
        break;
      case "Item":
        await prisma.item.update({ where: { id: entityId, organizationId }, data });
        break;
      case "Invoice":
        await prisma.invoice.update({ where: { id: entityId, organizationId }, data });
        break;
      case "Bill":
        await prisma.bill.update({ where: { id: entityId, organizationId }, data });
        break;
      case "Payment":
        await prisma.payment.update({ where: { id: entityId, organizationId }, data });
        break;
    }
  },

  /**
   * Counts non-deleted rows elsewhere in the schema that still point at this
   * entity, used to warn when undoing a masters batch whose parties/items
   * are referenced by later document imports. Document types (Invoice/Bill/
   * Payment) have no dependents in this schema.
   */
  async countReferences(
    organizationId: string,
    entityType: "Party" | "Item" | "Invoice" | "Bill" | "Payment",
    entityId: string,
  ): Promise<number> {
    switch (entityType) {
      case "Party": {
        const [invoices, bills, payments] = await Promise.all([
          prisma.invoice.count({ where: { organizationId, partyId: entityId, deletedAt: null } }),
          prisma.bill.count({ where: { organizationId, partyId: entityId, deletedAt: null } }),
          prisma.payment.count({ where: { organizationId, partyId: entityId, deletedAt: null } }),
        ]);
        return invoices + bills + payments;
      }
      case "Item": {
        const [lineItems, movements] = await Promise.all([
          prisma.invoiceLineItem.count({ where: { organizationId, itemId: entityId, deletedAt: null } }),
          prisma.stockMovement.count({ where: { organizationId, itemId: entityId, deletedAt: null } }),
        ]);
        return lineItems + movements;
      }
      default:
        return 0;
    }
  },
};
