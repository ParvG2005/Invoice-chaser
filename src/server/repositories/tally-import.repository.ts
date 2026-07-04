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
};
