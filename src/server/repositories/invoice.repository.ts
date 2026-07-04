import type { InvoiceStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Default page size for list endpoints; also a hard cap to avoid unbounded reads. */
export const INVOICE_PAGE_SIZE = 100;
export const INVOICE_MAX_PAGE_SIZE = 500;

export interface InvoiceListOptions {
  status?: InvoiceStatus;
  take?: number;
  cursor?: string;
  /** Filter to invoices billed to this party (Task 12 invoices-list filter panel). */
  partyId?: string;
  /** ISO date string (inclusive upper bound on dueDate). */
  dueBefore?: string;
  /** ISO date string (inclusive lower bound on dueDate). */
  dueAfter?: string;
  /** Case-insensitive match against invoiceNumber or clientName. */
  search?: string;
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
    const dueDateFilter: Prisma.DateTimeFilter = {};
    if (options.dueBefore) dueDateFilter.lte = new Date(options.dueBefore);
    if (options.dueAfter) dueDateFilter.gte = new Date(options.dueAfter);

    return prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.status ? { status: options.status } : {}),
        ...(options.partyId ? { partyId: options.partyId } : {}),
        ...(Object.keys(dueDateFilter).length > 0 ? { dueDate: dueDateFilter } : {}),
        ...(options.search
          ? {
              OR: [
                { invoiceNumber: { contains: options.search, mode: "insensitive" as const } },
                { clientName: { contains: options.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
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

  findByIdWithLineItems(organizationId: string, id: string) {
    return prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { lineItems: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
    });
  },

  /**
   * Looks up an invoice by number regardless of soft-delete state, since the
   * `@@unique([organizationId, invoiceNumber])` constraint is enforced at the
   * DB level across all rows (soft-deleted included). Used by `duplicate` to
   * pick a collision-free number for the copy.
   */
  findByInvoiceNumber(organizationId: string, invoiceNumber: string) {
    return prisma.invoice.findFirst({
      where: { organizationId, invoiceNumber },
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

  /**
   * Shifts every not-yet-sent Reminder for the invoice forward by `days`.
   * Prisma's `updateMany` can't do relative date math, so this reads the
   * pending rows and rewrites `scheduledFor` individually inside a
   * transaction. Returns the number of reminders shifted.
   */
  shiftPendingReminders(organizationId: string, invoiceId: string, days: number) {
    return prisma.$transaction(async (tx) => {
      const reminders = await tx.reminder.findMany({
        where: { organizationId, invoiceId, sentAt: null },
      });
      await Promise.all(
        reminders.map((reminder) =>
          tx.reminder.update({
            where: { id: reminder.id },
            data: {
              scheduledFor: new Date(reminder.scheduledFor.getTime() + days * 24 * 60 * 60 * 1000),
            },
          }),
        ),
      );
      return reminders.length;
    });
  },

  findCommunicationLogs(organizationId: string, invoiceId: string) {
    return prisma.communicationLog.findMany({
      where: { organizationId, invoiceId },
      orderBy: { createdAt: "desc" },
    });
  },

  findEmailLogs(organizationId: string, invoiceId: string) {
    return prisma.emailLog.findMany({
      where: { organizationId, invoiceId },
      orderBy: { createdAt: "desc" },
    });
  },

  findPaymentAllocations(organizationId: string, invoiceId: string) {
    return prisma.paymentAllocation.findMany({
      where: { organizationId, invoiceId, deletedAt: null },
      include: { payment: true },
      orderBy: { createdAt: "desc" },
    });
  },
};
