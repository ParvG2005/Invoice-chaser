import type { PaymentDirection, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface PaymentListOptions {
  partyId?: string;
  direction?: PaymentDirection;
  take?: number;
  cursor?: string;
}

export interface CreatePaymentData {
  organizationId: string;
  partyId: string;
  direction: PaymentDirection;
  amount: number;
  unallocated: number;
  mode: Prisma.PaymentCreateInput["mode"];
  paymentDate?: Date;
  reference?: string | null;
  notes?: string | null;
  tallyGuid?: string | null;
  tallyAlterId?: number | null;
}

export interface AllocationWrite {
  documentId: string; // invoice id (IN) or bill id (OUT)
  amount: number;
}

const paymentInclude = { allocations: { where: { deletedAt: null } } } as const;

/**
 * Applies one allocation amount to its target document (Invoice for IN, Bill for OUT)
 * inside the given transaction, and flips it to PAID once fully settled.
 * Guards paidAt the same way bill.service does: only set it on the actual
 * PENDING/OVERDUE -> PAID transition, never re-stomp an already-PAID document.
 * Since amountPaid only ever increments here, an already-PAID document should
 * never be a valid allocation target in the first place (callers filter those
 * out via findOpenInvoicesForParty / billRepository.findOpenForParty), but the
 * guard is kept defensively.
 *
 * Org-scoped: every read/write here is filtered by { id, organizationId,
 * deletedAt: null }, matching the pattern used by party/item/bill/stock
 * repositories, so this can never touch a document belonging to another org
 * even if a future caller passes an unvalidated documentId. Writes use
 * updateMany (which doesn't return the row) so a pre-update findFirst — also
 * org-scoped and inside the same transaction — supplies the amountPaid/total
 * needed to decide the PAID flip, instead of trusting update()'s return value.
 */
async function applyAllocation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  target: "invoice" | "bill",
  allocation: AllocationWrite,
) {
  if (target === "invoice") {
    const current = await tx.invoice.findFirst({
      where: { id: allocation.documentId, organizationId, deletedAt: null },
    });
    if (!current) return;

    await tx.invoice.updateMany({
      where: { id: allocation.documentId, organizationId, deletedAt: null },
      data: { amountPaid: { increment: allocation.amount } },
    });

    const newAmountPaid = Number(current.amountPaid) + allocation.amount;
    const total = Number(current.totalAmount ?? current.amount);
    if (current.status !== "PAID" && newAmountPaid >= total) {
      await tx.invoice.updateMany({
        where: { id: allocation.documentId, organizationId, deletedAt: null },
        data: { status: "PAID", paidAt: new Date() },
      });
    }
  } else {
    const current = await tx.bill.findFirst({
      where: { id: allocation.documentId, organizationId, deletedAt: null },
    });
    if (!current) return;

    await tx.bill.updateMany({
      where: { id: allocation.documentId, organizationId, deletedAt: null },
      data: { amountPaid: { increment: allocation.amount } },
    });

    const newAmountPaid = Number(current.amountPaid) + allocation.amount;
    if (current.status !== "PAID" && newAmountPaid >= Number(current.amount)) {
      await tx.bill.updateMany({
        where: { id: allocation.documentId, organizationId, deletedAt: null },
        data: { status: "PAID", paidAt: new Date() },
      });
    }
  }
}

export const paymentRepository = {
  findMany(organizationId: string, options: PaymentListOptions = {}) {
    return prisma.payment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.partyId ? { partyId: options.partyId } : {}),
        ...(options.direction ? { direction: options.direction } : {}),
      },
      include: paymentInclude,
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      take: Math.min(options.take ?? 100, 500),
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.payment.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: paymentInclude,
    });
  },

  /** Open (not fully paid) receivable invoices for a party, oldest due first. */
  findOpenInvoicesForParty(organizationId: string, partyId: string) {
    return prisma.invoice.findMany({
      where: {
        organizationId,
        partyId,
        deletedAt: null,
        type: "RECEIVABLE",
        status: { not: "PAID" },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
  },

  /**
   * Creates the payment + allocation rows and applies amountPaid/status to the
   * target documents — one atomic transaction.
   */
  createWithAllocations(data: CreatePaymentData, allocations: AllocationWrite[]) {
    const target = data.direction === "IN" ? ("invoice" as const) : ("bill" as const);

    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          organizationId: data.organizationId,
          partyId: data.partyId,
          direction: data.direction,
          amount: data.amount,
          unallocated: data.unallocated,
          mode: data.mode,
          ...(data.paymentDate ? { paymentDate: data.paymentDate } : {}),
          reference: data.reference ?? null,
          notes: data.notes ?? null,
          tallyGuid: data.tallyGuid ?? null,
          tallyAlterId: data.tallyAlterId ?? null,
        },
      });

      for (const allocation of allocations) {
        await tx.paymentAllocation.create({
          data: {
            organizationId: data.organizationId,
            paymentId: payment.id,
            ...(target === "invoice"
              ? { invoiceId: allocation.documentId }
              : { billId: allocation.documentId }),
            amount: allocation.amount,
          },
        });

        await applyAllocation(tx, data.organizationId, target, allocation);
      }

      return tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: paymentInclude,
      });
    });
  },

  /** Adds allocations to an existing payment and reduces its unallocated balance. */
  addAllocations(
    organizationId: string,
    paymentId: string,
    direction: PaymentDirection,
    allocations: AllocationWrite[],
    newUnallocated: number,
  ) {
    const target = direction === "IN" ? ("invoice" as const) : ("bill" as const);

    return prisma.$transaction(async (tx) => {
      for (const allocation of allocations) {
        await tx.paymentAllocation.create({
          data: {
            organizationId,
            paymentId,
            ...(target === "invoice"
              ? { invoiceId: allocation.documentId }
              : { billId: allocation.documentId }),
            amount: allocation.amount,
          },
        });

        await applyAllocation(tx, organizationId, target, allocation);
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: { unallocated: newUnallocated },
      });

      return tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: paymentInclude,
      });
    });
  },
};
