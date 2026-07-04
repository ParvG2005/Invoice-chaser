import type { Prisma } from "@/generated/prisma/client";
import { AppError, NotFoundError } from "@/lib/api/errors";
import type { CreateInvoiceInput } from "@/lib/validations/invoice";
import { invoiceRepository, type InvoiceLineItemInput } from "@/server/repositories/invoice.repository";
import { computeInvoiceStatus, parseDueDate, toInvoiceDto } from "@/server/services/mappers";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";
import { decimalToNumber } from "@/lib/utils/currency";
import { lineAmount, totals, type LineItemInput } from "@/modules/invoices/line-items";
import type { TimelineEntry } from "@/types";

/**
 * Converts the invoice editor's line-items input (Task 14 — `qty`/
 * `discountPct`/`taxRatePct`, matching `LineItemInput`) into the
 * repository's persisted shape (`quantity`/`discount`/`taxRate`/`amount`),
 * computing `amount` per row and `subtotal`/`taxAmount`/`totalAmount`
 * overall via the shared `lineAmount`/`totals` pure functions. Used by both
 * `POST /api/invoices` and `PATCH /api/invoices/[id]` so persisted totals
 * can never diverge from the client-side editor's math — the client-sent
 * `amount`/`subtotal`/`taxAmount`/`totalAmount` are ignored whenever
 * `lineItems` is supplied.
 */
export function computeLineItemsForInvoice(items: LineItemInput[]): {
  lineItems: InvoiceLineItemInput[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
} {
  const computedTotals = totals(items);
  const lineItems: InvoiceLineItemInput[] = items.map((li) => ({
    itemId: li.itemId,
    description: li.description,
    quantity: li.qty,
    rate: li.rate,
    discount: li.discountPct,
    taxRate: li.taxRatePct,
    amount: lineAmount(li),
  }));
  return {
    lineItems,
    subtotal: computedTotals.subtotal,
    taxAmount: computedTotals.taxAmount,
    totalAmount: computedTotals.total,
  };
}

/**
 * Widened service-level input for Invoice create/update. `clientEmail` is
 * required at the HTTP layer (createInvoiceSchema) but optional here, since
 * Tally-derived parties frequently have no email on file — the invoice still
 * imports; the email is filled in later (see Task 0 reconciliation note,
 * "Invoice — the biggest gap"). Every other field here is additive: the
 * plain zod-inferred CreateInvoiceInput/UpdateInvoiceInput remain fully
 * assignable, so existing (non-import) callers are unaffected.
 */
export interface InvoiceServiceCreateInput extends Omit<CreateInvoiceInput, "clientEmail" | "lineItems"> {
  clientEmail?: string;
  partyId?: string;
  type?: "RECEIVABLE" | "PAYABLE";
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  tallyGuid?: string;
  tallyAlterId?: number;
  lineItems?: InvoiceLineItemInput[];
}

/**
 * Extra scalar/relation fields beyond the original flat shape (partyId,
 * type, subtotal, taxAmount, totalAmount, tallyGuid, tallyAlterId). Shared
 * between create and update; the `party` relation is connect-only here —
 * `update` handles disconnect separately since only it needs to support
 * clearing an existing partyId.
 */
/**
 * The overdue-check enqueue is a best-effort background job trigger, not
 * part of create/update's correctness contract. Without this guard, a
 * transient Inngest failure (e.g. missing INNGEST_EVENT_KEY in an
 * environment that hasn't configured it — dev, CI, or a misconfigured
 * import worker) throws from inside `create`/`update` *after* the Invoice
 * row has already been durably written, making the whole call look failed
 * to the caller even though the write succeeded. Bulk import paths (see
 * tally-import.service.ts's importSalesVoucher) treat any thrown error as
 * "nothing was created" and log an ERRORED ImportRecord with no entityId —
 * silently orphaning the row it can no longer find to undo. Swallow and log
 * instead of throwing so a persisted write is never rolled back by a
 * notification side effect failing.
 */
async function enqueueOverdueCheckBestEffort(organizationId: string): Promise<void> {
  try {
    await getJobScheduler().enqueueOverdueCheck(organizationId);
  } catch (error) {
    console.error("invoiceService: enqueueOverdueCheck failed (non-fatal)", error);
  }
}

/**
 * Picks a collision-free invoice number for a duplicate: `<original>-COPY`,
 * falling back to `<original>-COPY-2`, `-COPY-3`, ... The
 * `@@unique([organizationId, invoiceNumber])` constraint is enforced across
 * all rows (soft-deleted included), so each candidate is checked against the
 * repo before use.
 */
async function nextCopyNumber(organizationId: string, baseNumber: string): Promise<string> {
  let candidate = `${baseNumber}-COPY`;
  let suffix = 1;
  while (await invoiceRepository.findByInvoiceNumber(organizationId, candidate)) {
    suffix += 1;
    candidate = `${baseNumber}-COPY-${suffix}`;
  }
  return candidate;
}

function extraInvoiceFields(
  input: Partial<InvoiceServiceCreateInput>,
): Partial<Prisma.InvoiceCreateInput> {
  const fields: Partial<Prisma.InvoiceCreateInput> = {};
  if (input.partyId) fields.party = { connect: { id: input.partyId } };
  if (input.type !== undefined) fields.type = input.type;
  if (input.subtotal !== undefined) fields.subtotal = input.subtotal;
  if (input.taxAmount !== undefined) fields.taxAmount = input.taxAmount;
  if (input.totalAmount !== undefined) fields.totalAmount = input.totalAmount;
  if (input.tallyGuid !== undefined) fields.tallyGuid = input.tallyGuid;
  if (input.tallyAlterId !== undefined) fields.tallyAlterId = input.tallyAlterId;
  return fields;
}

export const invoiceService = {
  async list(
    organizationId: string,
    options: {
      status?: "PENDING" | "OVERDUE" | "PAID";
      take?: number;
      cursor?: string;
      partyId?: string;
      dueBefore?: string;
      dueAfter?: string;
      search?: string;
    } = {},
  ) {
    const invoices = await invoiceRepository.findMany(organizationId, options);
    return invoices.map(toInvoiceDto);
  },

  /** Bulk mutation for the invoices-list bulk-actions bar (Task 12). */
  async bulkAction(
    organizationId: string,
    action: "delete" | "markPaid" | "sendReminders",
    ids: string[],
  ) {
    if (action === "delete") {
      for (const id of ids) {
        await invoiceRepository.softDelete(organizationId, id);
      }
      return { action, count: ids.length };
    }
    if (action === "markPaid") {
      for (const id of ids) {
        await invoiceRepository.update(organizationId, id, {
          status: "PAID",
          paidAt: new Date(),
        });
      }
      return { action, count: ids.length };
    }
    // sendReminders: scope the scan to just the selected invoices, same as
    // the "Send reminder now" row action and POST /api/reminders/trigger.
    const { reminderService } = await import("@/server/services/reminder.service");
    await reminderService.scheduleRemindersForInvoices(organizationId, ids);
    return { action, count: ids.length };
  },

  async get(organizationId: string, id: string) {
    const invoice = await invoiceRepository.findById(organizationId, id);
    if (!invoice) throw new NotFoundError("Invoice not found");
    return toInvoiceDto(invoice);
  },

  async create(organizationId: string, input: InvoiceServiceCreateInput) {
    const dueDate = parseDueDate(input.dueDate);
    const status = computeInvoiceStatus(dueDate, input.status);

    const data: Prisma.InvoiceCreateInput = {
      organization: { connect: { id: organizationId } },
      clientName: input.clientName,
      clientEmail: input.clientEmail ?? "",
      clientPhone: input.clientPhone ?? null,
      amount: input.amount,
      dueDate,
      invoiceNumber: input.invoiceNumber,
      notes: input.notes,
      status,
      ...extraInvoiceFields(input),
    };

    const invoice = input.lineItems
      ? await invoiceRepository.createWithLineItems(data, input.lineItems)
      : await invoiceRepository.create(data);

    await enqueueOverdueCheckBestEffort(organizationId);
    return toInvoiceDto(invoice);
  },

  async bulkCreate(organizationId: string, inputs: CreateInvoiceInput[]) {
    const data = inputs.map((input) => {
      const dueDate = parseDueDate(input.dueDate);
      return {
        organizationId,
        clientName: input.clientName,
        clientEmail: input.clientEmail,
        clientPhone: input.clientPhone ?? null,
        amount: input.amount,
        dueDate,
        invoiceNumber: input.invoiceNumber,
        notes: input.notes ?? null,
        status: computeInvoiceStatus(dueDate, input.status),
      };
    });

    await invoiceRepository.createMany(data);
    await enqueueOverdueCheckBestEffort(organizationId);

    // Return only the invoices from this batch (bounded by input size) rather than
    // re-reading the whole table.
    const invoiceNumbers = data.map((d) => d.invoiceNumber);
    const invoices = await invoiceRepository.findByInvoiceNumbers(organizationId, invoiceNumbers);
    return invoices.map(toInvoiceDto);
  },

  async update(organizationId: string, id: string, input: Partial<InvoiceServiceCreateInput>) {
    const existing = await invoiceRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Invoice not found");

    const dueDate = input.dueDate ? parseDueDate(input.dueDate) : existing.dueDate;
    const status = input.status
      ? input.status
      : computeInvoiceStatus(dueDate, input.status ?? existing.status);

    const updateData: Parameters<typeof invoiceRepository.update>[2] = {
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone !== undefined ? input.clientPhone : undefined,
      amount: input.amount,
      dueDate: input.dueDate ? dueDate : undefined,
      invoiceNumber: input.invoiceNumber,
      notes: input.notes,
      status,
      ...extraInvoiceFields(input),
    };

    if (status === "PAID") {
      updateData.paidAt = new Date();
    } else if (input.status === "PENDING" || input.status === "OVERDUE") {
      updateData.paidAt = null;
    }

    if (input.lineItems) {
      await invoiceRepository.replaceLineItems(organizationId, id, input.lineItems);
    }
    await invoiceRepository.update(organizationId, id, updateData);

    return this.get(organizationId, id);
  },

  async remove(organizationId: string, id: string) {
    const result = await invoiceRepository.softDelete(organizationId, id);
    if (result.count === 0) throw new NotFoundError("Invoice not found");
    return { deleted: true };
  },

  async syncOverdue(organizationId: string) {
    await invoiceRepository.markOverdueBatch(organizationId);
    return { success: true };
  },

  /**
   * Copies an invoice and its (non-deleted) line items into a new PENDING
   * invoice. Numbering scheme: `<original>-COPY`, incrementing a numeric
   * suffix on collision (see `nextCopyNumber`). `amountPaid` is left unset so
   * it takes the schema default of 0 on the new row. There is no dedicated
   * "issue date" field on Invoice — `dueDate` is copied as-is from the
   * source; `createdAt` naturally becomes "today" since it's a fresh row.
   */
  async duplicate(organizationId: string, id: string) {
    const existing = await invoiceRepository.findByIdWithLineItems(organizationId, id);
    if (!existing) throw new NotFoundError("Invoice not found");

    const invoiceNumber = await nextCopyNumber(organizationId, existing.invoiceNumber);

    const data: Prisma.InvoiceCreateInput = {
      organization: { connect: { id: organizationId } },
      clientName: existing.clientName,
      clientEmail: existing.clientEmail,
      clientPhone: existing.clientPhone,
      amount: existing.amount,
      dueDate: existing.dueDate,
      invoiceNumber,
      notes: existing.notes,
      status: "PENDING",
      ...extraInvoiceFields({
        partyId: existing.partyId ?? undefined,
        type: existing.type,
        subtotal: existing.subtotal !== null ? decimalToNumber(existing.subtotal) : undefined,
        taxAmount: existing.taxAmount !== null ? decimalToNumber(existing.taxAmount) : undefined,
        totalAmount: existing.totalAmount !== null ? decimalToNumber(existing.totalAmount) : undefined,
      }),
    };

    const lineItems: InvoiceLineItemInput[] = existing.lineItems.map((li) => ({
      itemId: li.itemId ?? undefined,
      description: li.description,
      quantity: decimalToNumber(li.quantity),
      rate: decimalToNumber(li.rate),
      amount: decimalToNumber(li.amount),
    }));

    const invoice =
      lineItems.length > 0
        ? await invoiceRepository.createWithLineItems(data, lineItems)
        : await invoiceRepository.create(data);

    return toInvoiceDto(invoice);
  },

  /**
   * Marks an invoice WRITTEN_OFF. There's no dedicated column for the
   * write-off reason on Invoice, so it's appended to the existing free-text
   * `notes` field rather than discarded.
   */
  async writeOff(organizationId: string, id: string, reason?: string) {
    const existing = await invoiceRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Invoice not found");

    if (existing.status === "PAID") {
      throw new AppError("INVALID_STATUS_TRANSITION", "Cannot write off a paid invoice", 409);
    }

    const notes = reason
      ? existing.notes
        ? `${existing.notes}\n\nWritten off: ${reason}`
        : `Written off: ${reason}`
      : existing.notes;

    await invoiceRepository.update(organizationId, id, { status: "WRITTEN_OFF", notes });
    return this.get(organizationId, id);
  },

  /** Shifts every unsent Reminder for the invoice forward by `days`. */
  async snooze(organizationId: string, id: string, days: number) {
    const existing = await invoiceRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Invoice not found");

    await invoiceRepository.shiftPendingReminders(organizationId, id, days);
    return this.get(organizationId, id);
  },

  /**
   * Merges CommunicationLog rows (falling back to legacy EmailLog rows when
   * there are no CommunicationLog rows for this invoice) with
   * PaymentAllocations, sorted newest-first.
   */
  async timeline(organizationId: string, id: string): Promise<TimelineEntry[]> {
    const existing = await invoiceRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Invoice not found");

    const commLogs = await invoiceRepository.findCommunicationLogs(organizationId, id);

    const communicationEntries: TimelineEntry[] =
      commLogs.length > 0
        ? commLogs.map((log) => ({
            id: log.id,
            at: (log.sentAt ?? log.createdAt).toISOString(),
            kind: "COMMUNICATION" as const,
            channel: log.channel,
            status: log.status,
            summary: `${log.channel} to ${log.toAddress}: ${log.status}`,
          }))
        : (await invoiceRepository.findEmailLogs(organizationId, id)).map((log) => ({
            id: log.id,
            at: (log.sentAt ?? log.createdAt).toISOString(),
            kind: "COMMUNICATION" as const,
            channel: "EMAIL" as const,
            status: log.status,
            summary: `EMAIL to ${log.toEmail}: ${log.status}`,
          }));

    const allocations = await invoiceRepository.findPaymentAllocations(organizationId, id);
    const paymentEntries: TimelineEntry[] = allocations.map((allocation) => ({
      id: allocation.id,
      at: allocation.createdAt.toISOString(),
      kind: "PAYMENT" as const,
      amount: decimalToNumber(allocation.amount).toString(),
      summary: `Payment of ${decimalToNumber(allocation.amount)} (${allocation.payment.mode})`,
    }));

    return [...communicationEntries, ...paymentEntries].sort((a, b) => (a.at < b.at ? 1 : -1));
  },
};
