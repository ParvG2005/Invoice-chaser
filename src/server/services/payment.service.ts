import { NotFoundError, ValidationError } from "@/lib/api/errors";
import type { CreatePaymentInput, ExplicitAllocation } from "@/lib/validations/payment";
import type { PaymentDto } from "@/types";
import { decimalToNumber } from "@/lib/utils/currency";
import {
  paymentRepository,
  type PaymentListOptions,
} from "@/server/repositories/payment.repository";
import { partyRepository } from "@/server/repositories/party.repository";
import { billRepository } from "@/server/repositories/bill.repository";
import {
  planAllocations,
  type OpenDocument,
  type PlannedAllocation,
} from "@/server/services/payment-allocation";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";
import { enqueueInvoicePaidBestEffort } from "@/server/services/invoice.service";

const round2 = (n: number) => Math.round(n * 100) / 100;

type PaymentWithAllocations = Awaited<ReturnType<typeof paymentRepository.findMany>>[number];

function toPaymentDto(payment: PaymentWithAllocations): PaymentDto {
  return {
    id: payment.id,
    partyId: payment.partyId,
    direction: payment.direction,
    amount: decimalToNumber(payment.amount),
    unallocated: decimalToNumber(payment.unallocated),
    mode: payment.mode,
    paymentDate: payment.paymentDate.toISOString(),
    reference: payment.reference,
    notes: payment.notes,
    currency: payment.currency,
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      invoiceId: allocation.invoiceId,
      billId: allocation.billId,
      amount: decimalToNumber(allocation.amount),
    })),
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

/** Open invoices (IN) or bills (OUT) for the party, as plain OpenDocuments. */
async function loadOpenDocuments(
  organizationId: string,
  partyId: string,
  direction: "IN" | "OUT",
): Promise<OpenDocument[]> {
  if (direction === "IN") {
    const invoices = await paymentRepository.findOpenInvoicesForParty(organizationId, partyId);
    return invoices.map((invoice) => ({
      id: invoice.id,
      dueDate: invoice.dueDate,
      outstanding: round2(
        decimalToNumber(invoice.totalAmount ?? invoice.amount) -
          decimalToNumber(invoice.amountPaid),
      ),
    }));
  }
  const bills = await billRepository.findOpenForParty(organizationId, partyId);
  return bills.map((bill) => ({
    id: bill.id,
    dueDate: bill.dueDate,
    outstanding: round2(decimalToNumber(bill.amount) - decimalToNumber(bill.amountPaid)),
  }));
}

/**
 * Invoice ids that this allocation plan fully settles (allocation amount
 * covers the document's entire pre-payment outstanding balance). Every
 * `openDocuments` entry here is guaranteed non-PAID beforehand (both
 * `findOpenInvoicesForParty` and `findOpenForParty` filter out PAID
 * documents), so "amount >= outstanding" is exactly the PENDING/OVERDUE ->
 * PAID transition the repository's `applyAllocation` makes inside the
 * transaction — computed here from the same validated plan data so the
 * INVOICE_PAID event fires once per real transition, not on every payment
 * against an already-PAID invoice.
 */
function fullySettledInvoiceIds(
  openDocuments: OpenDocument[],
  allocations: PlannedAllocation[],
): string[] {
  const outstandingById = new Map(openDocuments.map((d) => [d.id, d.outstanding]));
  return allocations
    .filter((a) => {
      const outstanding = outstandingById.get(a.documentId);
      return outstanding !== undefined && round2(a.amount) >= round2(outstanding);
    })
    .map((a) => a.documentId);
}

async function enqueuePaidInvoicesBestEffort(organizationId: string, invoiceIds: string[]): Promise<void> {
  for (const invoiceId of invoiceIds) {
    await enqueueInvoicePaidBestEffort(organizationId, invoiceId);
  }
}

/** Validates explicit bill-wise refs against open documents; returns the plan. */
function validateExplicitAllocations(
  amount: number,
  explicit: ExplicitAllocation[],
  openDocuments: OpenDocument[],
): { allocations: PlannedAllocation[]; unallocated: number } {
  const openById = new Map(openDocuments.map((d) => [d.id, d]));
  let total = 0;

  // Aggregate by documentId first: two entries targeting the same document can
  // each be individually <= outstanding while together overpaying it (and
  // incorrectly flipping it to PAID). The per-entry check below alone can't
  // catch that, so validate the summed-per-document amount too.
  const byDocumentId = new Map<string, number>();
  for (const allocation of explicit) {
    byDocumentId.set(
      allocation.documentId,
      round2((byDocumentId.get(allocation.documentId) ?? 0) + allocation.amount),
    );
  }
  for (const [documentId, aggregatedAmount] of byDocumentId) {
    const document = openById.get(documentId);
    if (!document) continue; // reported by the per-entry loop below
    if (aggregatedAmount > document.outstanding) {
      throw new ValidationError(
        `Allocation ${aggregatedAmount} exceeds outstanding ${document.outstanding} on ${documentId}`,
      );
    }
  }

  for (const allocation of explicit) {
    const document = openById.get(allocation.documentId);
    if (!document) {
      throw new ValidationError(
        `Allocation target ${allocation.documentId} is not an open document for this party`,
      );
    }
    if (allocation.amount > document.outstanding) {
      throw new ValidationError(
        `Allocation ${round2(allocation.amount)} exceeds outstanding ${document.outstanding} on ${allocation.documentId}`,
      );
    }
    total = round2(total + allocation.amount);
  }

  if (total > amount) {
    throw new ValidationError("Allocations exceed the payment amount");
  }

  return {
    allocations: explicit.map((a) => ({ documentId: a.documentId, amount: round2(a.amount) })),
    unallocated: round2(amount - total),
  };
}

export const paymentService = {
  async list(organizationId: string, options: PaymentListOptions = {}) {
    const payments = await paymentRepository.findMany(organizationId, options);
    return payments.map(toPaymentDto);
  },

  async get(organizationId: string, id: string) {
    const payment = await paymentRepository.findById(organizationId, id);
    if (!payment) throw new NotFoundError("Payment not found");
    return toPaymentDto(payment);
  },

  async create(
    organizationId: string,
    input: CreatePaymentInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const party = await partyRepository.findById(organizationId, input.partyId);
    if (!party) throw new NotFoundError("Party not found");

    const openDocuments = await loadOpenDocuments(organizationId, input.partyId, input.direction);

    // `allocations: undefined` (key omitted) means "no explicit intent" -> auto
    // FIFO. `allocations: []` is a deliberate explicit choice (e.g. importers
    // resolving refs to real documents beforehand and finding none matched)
    // and must leave the full amount unallocated rather than silently
    // FIFO-applying it to unrelated open documents.
    const plan =
      input.allocations !== undefined
        ? validateExplicitAllocations(input.amount, input.allocations, openDocuments)
        : planAllocations(input.amount, openDocuments);

    const result = await withAudit(
      actor,
      "payment.create",
      { organizationId, entityType: "Payment" },
      async () => {
        const payment = await paymentRepository.createWithAllocations(
          {
            organizationId,
            partyId: input.partyId,
            direction: input.direction,
            amount: input.amount,
            unallocated: plan.unallocated,
            mode: input.mode,
            paymentDate: input.paymentDate,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            tallyGuid: input.tallyGuid ?? null,
            tallyAlterId: input.tallyAlterId ?? null,
          },
          plan.allocations,
        );
        return toPaymentDto(payment);
      },
    );

    if (input.direction === "IN") {
      const paidInvoiceIds = fullySettledInvoiceIds(openDocuments, plan.allocations);
      await enqueuePaidInvoicesBestEffort(organizationId, paidInvoiceIds);
    }

    return result;
  },

  async allocatePayment(
    organizationId: string,
    paymentId: string,
    allocations?: ExplicitAllocation[],
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const payment = await paymentRepository.findById(organizationId, paymentId);
    if (!payment) throw new NotFoundError("Payment not found");

    const unallocated = decimalToNumber(payment.unallocated);
    if (unallocated <= 0) {
      throw new ValidationError("Payment has no unallocated balance");
    }

    const openDocuments = await loadOpenDocuments(
      organizationId,
      payment.partyId,
      payment.direction,
    );

    const plan = allocations?.length
      ? validateExplicitAllocations(unallocated, allocations, openDocuments)
      : planAllocations(unallocated, openDocuments);

    if (plan.allocations.length === 0) {
      throw new ValidationError("No open documents to allocate against");
    }

    const result = await withAudit(
      actor,
      "payment.allocate",
      { organizationId, entityType: "Payment", entityId: paymentId, before: toPaymentDto(payment) },
      async () => {
        const updated = await paymentRepository.addAllocations(
          organizationId,
          paymentId,
          payment.direction,
          plan.allocations,
          plan.unallocated,
        );
        return toPaymentDto(updated);
      },
    );

    if (payment.direction === "IN") {
      const paidInvoiceIds = fullySettledInvoiceIds(openDocuments, plan.allocations);
      await enqueuePaidInvoicesBestEffort(organizationId, paidInvoiceIds);
    }

    return result;
  },
};
