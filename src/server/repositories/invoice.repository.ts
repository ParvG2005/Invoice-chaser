import type { InvoiceStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Default page size for list endpoints; also a hard cap to avoid unbounded reads. */
export const INVOICE_PAGE_SIZE = 100;
export const INVOICE_MAX_PAGE_SIZE = 500;

export interface InvoiceListOptions {
  status?: InvoiceStatus;
  take?: number;
  cursor?: string;
}

export interface InvoiceLineItemInput {
  itemId?: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

function lineItemsCreateManyData(
  organizationId: string,
  invoiceId: string,
  lineItems: InvoiceLineItemInput[],
): Prisma.InvoiceLineItemCreateManyInput[] {
  return lineItems.map((li, index) => ({
    organizationId,
    invoiceId,
    itemId: li.itemId ?? null,
    description: li.description,
    quantity: li.quantity,
    rate: li.rate,
    amount: li.amount,
    sortOrder: index,
  }));
}

export const invoiceRepository = {
  findMany(organizationId: string, options: InvoiceListOptions = {}) {
    const take = Math.min(options.take ?? INVOICE_PAGE_SIZE, INVOICE_MAX_PAGE_SIZE);
    return prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },

  findByInvoiceNumbers(organizationId: string, invoiceNumbers: string[]) {
    return prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        invoiceNumber: { in: invoiceNumbers },
      },
      orderBy: { dueDate: "asc" },
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  },

  create(data: Prisma.InvoiceCreateInput) {
    return prisma.invoice.create({ data });
  },

  createMany(data: Prisma.InvoiceCreateManyInput[]) {
    return prisma.invoice.createMany({ data, skipDuplicates: true });
  },

  /**
   * Creates an invoice and its line items atomically. Mirrors
   * paymentRepository.createWithAllocations's transaction style.
   */
  createWithLineItems(data: Prisma.InvoiceCreateInput, lineItems: InvoiceLineItemInput[]) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({ data });
      if (lineItems.length > 0) {
        await tx.invoiceLineItem.createMany({
          data: lineItemsCreateManyData(invoice.organizationId, invoice.id, lineItems),
        });
      }
      return invoice;
    });
  },

  /**
   * Soft-deletes an invoice's existing line items and writes the replacement
   * set, atomically. Used when re-importing a voucher whose ALTERID advanced.
   */
  replaceLineItems(organizationId: string, invoiceId: string, lineItems: InvoiceLineItemInput[]) {
    return prisma.$transaction(async (tx) => {
      await tx.invoiceLineItem.updateMany({
        where: { organizationId, invoiceId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (lineItems.length > 0) {
        await tx.invoiceLineItem.createMany({
          data: lineItemsCreateManyData(organizationId, invoiceId, lineItems),
        });
      }
    });
  },

  update(organizationId: string, id: string, data: Prisma.InvoiceUpdateInput) {
    return prisma.invoice.updateMany({
      where: { id, organizationId, deletedAt: null },
      data,
    });
  },

  softDelete(organizationId: string, id: string) {
    return prisma.invoice.updateMany({
      where: { id, organizationId },
      data: { deletedAt: new Date() },
    });
  },

  findOverdue(organizationId: string, asOf = new Date()) {
    return prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ["PENDING", "OVERDUE"] },
        dueDate: { lt: asOf },
      },
    });
  },

  markOverdueBatch(organizationId: string, asOf = new Date()) {
    return prisma.invoice.updateMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "PENDING",
        dueDate: { lt: asOf },
      },
      data: { status: "OVERDUE" },
    });
  },
};
