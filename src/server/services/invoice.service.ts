import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "@/lib/api/errors";
import type { CreateInvoiceInput } from "@/lib/validations/invoice";
import { invoiceRepository, type InvoiceLineItemInput } from "@/server/repositories/invoice.repository";
import { computeInvoiceStatus, parseDueDate, toInvoiceDto } from "@/server/services/mappers";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";

/**
 * Widened service-level input for Invoice create/update. `clientEmail` is
 * required at the HTTP layer (createInvoiceSchema) but optional here, since
 * Tally-derived parties frequently have no email on file — the invoice still
 * imports; the email is filled in later (see Task 0 reconciliation note,
 * "Invoice — the biggest gap"). Every other field here is additive: the
 * plain zod-inferred CreateInvoiceInput/UpdateInvoiceInput remain fully
 * assignable, so existing (non-import) callers are unaffected.
 */
export interface InvoiceServiceCreateInput extends Omit<CreateInvoiceInput, "clientEmail"> {
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
    options: { status?: "PENDING" | "OVERDUE" | "PAID"; take?: number; cursor?: string } = {},
  ) {
    const invoices = await invoiceRepository.findMany(organizationId, options);
    return invoices.map(toInvoiceDto);
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
};
