import type { Prisma } from "@/generated/prisma/client";
import { AppError, NotFoundError } from "@/lib/api/errors";
import { invalidateAnalyticsCache } from "@/lib/cache/analytics-cache";
import type { CreateInvoiceInput, PdfImportInvoiceInput } from "@/lib/validations/invoice";
import { invoiceRepository, type InvoiceLineItemInput } from "@/server/repositories/invoice.repository";
import { partyRepository } from "@/server/repositories/party.repository";
import { itemRepository } from "@/server/repositories/item.repository";
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
 * Shared with payment.service.ts: recording a payment that settles an
 * invoice to PAID (the common path — via payment-allocation, not a direct
 * PATCH of invoice.status) must fire the same best-effort thank-you-email
 * trigger as this file's own PAID transition in `update()`. Exported rather
 * than duplicated so the try/catch/log shape can't drift between the two
 * call sites.
 */
export async function enqueueInvoicePaidBestEffort(organizationId: string, id: string): Promise<void> {
  try {
    await getJobScheduler().enqueueInvoicePaid(organizationId, id);
  } catch (error) {
    console.error("invoiceService: enqueueInvoicePaid failed (non-fatal)", error);
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

/**
 * Finds-or-creates the buyer Party for a PDF-imported invoice and returns its
 * id (or `undefined` when there's nothing to link — no clientName and no
 * match). Match precedence: GSTIN → name. On a create, all contact fields are
 * best-effort (nullable). On a match, missing GSTIN/email/phone/address are
 * backfilled from the invoice; existing values are never overwritten.
 */
async function resolvePartyId(
  organizationId: string,
  input: PdfImportInvoiceInput,
): Promise<string | undefined> {
  const gstin = input.buyerGstin || undefined;
  const email = input.clientEmail || undefined;
  const phone = input.clientPhone || undefined;
  const address = input.buyerAddress || undefined;

  let party = gstin ? await partyRepository.findByGstin(organizationId, gstin) : null;
  if (!party && input.clientName) {
    party = await partyRepository.findByName(organizationId, input.clientName);
  }

  if (!party) {
    if (!input.clientName) return undefined;
    const createdParty = await partyRepository.create({
      organization: { connect: { id: organizationId } },
      name: input.clientName,
      email: email ?? null,
      phone: phone ?? null,
      gstin: gstin ?? null,
      billingAddress: address ?? null,
      type: "CUSTOMER",
    });
    return createdParty.id;
  }

  // Backfill only the fields the matched party is missing.
  const patch: Prisma.PartyUncheckedUpdateInput = {};
  if (!party.gstin && gstin) patch.gstin = gstin;
  if (!party.email && email) patch.email = email;
  if (!party.phone && phone) patch.phone = phone;
  if (!party.billingAddress && address) patch.billingAddress = address;
  if (Object.keys(patch).length > 0) {
    await partyRepository.update(organizationId, party.id, patch);
  }
  return party.id;
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
      invalidateAnalyticsCache(organizationId);
      return { action, count: ids.length };
    }
    if (action === "markPaid") {
      for (const id of ids) {
        await invoiceRepository.update(organizationId, id, {
          status: "PAID",
          paidAt: new Date(),
        });
      }
      invalidateAnalyticsCache(organizationId);
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
    invalidateAnalyticsCache(organizationId);
    return toInvoiceDto(invoice);
  },

  async bulkCreate(organizationId: string, inputs: CreateInvoiceInput[]) {
    // When an input carries line items (PDF/Tally-CSV imports), compute the
    // persisted line-item rows + subtotal/taxAmount/totalAmount from the same
    // shared math as `create`/`update`, so bulk-imported invoices are no longer
    // stored as a bare grand-total. Inputs without line items (plain CSV) keep
    // exactly their previous flat shape.
    const rows = inputs.map((input) => {
      const dueDate = parseDueDate(input.dueDate);
      const computed =
        input.lineItems && input.lineItems.length > 0
          ? computeLineItemsForInvoice(input.lineItems)
          : null;
      return {
        data: {
          organizationId,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          clientPhone: input.clientPhone ?? null,
          amount: input.amount,
          dueDate,
          invoiceNumber: input.invoiceNumber,
          notes: input.notes ?? null,
          status: computeInvoiceStatus(dueDate, input.status),
          ...(computed
            ? {
                subtotal: computed.subtotal,
                taxAmount: computed.taxAmount,
                totalAmount: computed.totalAmount,
              }
            : {}),
        },
        lineItems: computed?.lineItems ?? null,
      };
    });

    // `createMany` skips duplicate invoiceNumbers rather than updating them, so
    // line items must only be attached to invoices this batch actually created
    // — never to a pre-existing row (which would double up its items and whose
    // scalar totals were left untouched). Snapshot the pre-existing numbers
    // before insert to tell the two apart.
    const invoiceNumbers = rows.map((r) => r.data.invoiceNumber);
    const preExisting = new Set(
      (await invoiceRepository.findByInvoiceNumbers(organizationId, invoiceNumbers)).map(
        (inv) => inv.invoiceNumber,
      ),
    );

    await invoiceRepository.createMany(rows.map((r) => r.data));

    // Return only the invoices from this batch (bounded by input size) rather than
    // re-reading the whole table.
    const invoices = await invoiceRepository.findByInvoiceNumbers(organizationId, invoiceNumbers);
    const invoiceByNumber = new Map(invoices.map((inv) => [inv.invoiceNumber, inv]));

    const lineItemEntries = rows
      .filter((r) => r.lineItems && !preExisting.has(r.data.invoiceNumber))
      .map((r) => {
        const invoice = invoiceByNumber.get(r.data.invoiceNumber);
        return invoice ? { organizationId, invoiceId: invoice.id, lineItems: r.lineItems! } : null;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    if (lineItemEntries.length > 0) {
      await invoiceRepository.createManyLineItems(lineItemEntries);
    }

    await enqueueOverdueCheckBestEffort(organizationId);
    invalidateAnalyticsCache(organizationId);

    return invoices.map(toInvoiceDto);
  },

  /**
   * PDF-invoice import with full master-data enrichment (distinct from the
   * generic `bulkCreate`/CSV path, which never touches Party/Item). Per
   * invoice, sequentially:
   *   1. Skip entirely if the invoiceNumber already exists (mirrors
   *      `bulkCreate`'s skip-duplicates semantics).
   *   2. Upsert the buyer Party — match by GSTIN first, then by name; create
   *      when neither matches and a clientName is present; otherwise backfill a
   *      matched party's missing GSTIN/email/phone/address. Link `partyId`.
   *   3. Create/link a Stock Item per line-item description (by name), stamping
   *      the line's HSN code + GST rate onto newly-created items. Link `itemId`.
   *   4. Create the invoice (with computed line-item totals when present).
   *
   * Every enrichment field is optional: a missing GSTIN/email/phone/address or
   * empty line items never blocks the import — Party needs only name+org, Item
   * only name+org.
   */
  async importPdfInvoices(organizationId: string, inputs: PdfImportInvoiceInput[]) {
    const created: Awaited<ReturnType<typeof invoiceRepository.create>>[] = [];

    for (const input of inputs) {
      // Dedupe: skip a number that already exists (soft-deleted rows included,
      // matching the DB-level unique constraint).
      if (await invoiceRepository.findByInvoiceNumber(organizationId, input.invoiceNumber)) {
        continue;
      }

      const partyId = await resolvePartyId(organizationId, input);

      const rawLineItems = input.lineItems ?? [];
      const itemIds: (string | undefined)[] = [];
      for (const li of rawLineItems) {
        let item = await itemRepository.findByName(organizationId, li.description);
        if (!item) {
          item = await itemRepository.create({
            organization: { connect: { id: organizationId } },
            name: li.description,
            hsnCode: li.hsnCode ?? null,
            gstRate: li.taxRatePct ?? null,
          });
        }
        itemIds.push(item.id);
      }

      const dueDate = parseDueDate(input.dueDate);
      const status = computeInvoiceStatus(dueDate, input.status);

      const baseData: Prisma.InvoiceCreateInput = {
        organization: { connect: { id: organizationId } },
        clientName: input.clientName,
        clientEmail: input.clientEmail ?? "",
        clientPhone: input.clientPhone ?? null,
        amount: input.amount,
        dueDate,
        invoiceNumber: input.invoiceNumber,
        notes: input.notes ?? null,
        status,
      };

      let invoice;
      if (rawLineItems.length > 0) {
        const computed = computeLineItemsForInvoice(rawLineItems);
        const lineItems = computed.lineItems.map((li, i) => ({
          ...li,
          itemId: itemIds[i] ?? li.itemId,
        }));
        invoice = await invoiceRepository.createWithLineItems(
          {
            ...baseData,
            ...extraInvoiceFields({
              partyId,
              subtotal: computed.subtotal,
              taxAmount: computed.taxAmount,
              totalAmount: computed.totalAmount,
            }),
          },
          lineItems,
        );
      } else {
        invoice = await invoiceRepository.create({
          ...baseData,
          ...extraInvoiceFields({ partyId }),
        });
      }

      created.push(invoice);
    }

    await enqueueOverdueCheckBestEffort(organizationId);
    invalidateAnalyticsCache(organizationId);

    return created.map(toInvoiceDto);
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

    if (status === "PAID" && existing.status !== "PAID") {
      await enqueueInvoicePaidBestEffort(organizationId, id);
    }

    invalidateAnalyticsCache(organizationId);
    return this.get(organizationId, id);
  },

  async remove(organizationId: string, id: string) {
    const result = await invoiceRepository.softDelete(organizationId, id);
    if (result.count === 0) throw new NotFoundError("Invoice not found");
    invalidateAnalyticsCache(organizationId);
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
    invalidateAnalyticsCache(organizationId);
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
