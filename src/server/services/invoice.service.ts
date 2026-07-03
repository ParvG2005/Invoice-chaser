import { NotFoundError } from "@/lib/api/errors";
import type { CreateInvoiceInput, UpdateInvoiceInput } from "@/lib/validations/invoice";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { computeInvoiceStatus, parseDueDate, toInvoiceDto } from "@/server/services/mappers";
import { getJobScheduler } from "@/lib/jobs/inngest/scheduler";

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

  async create(organizationId: string, input: CreateInvoiceInput) {
    const dueDate = parseDueDate(input.dueDate);
    const status = computeInvoiceStatus(dueDate, input.status);

    const invoice = await invoiceRepository.create({
      organization: { connect: { id: organizationId } },
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone ?? null,
      amount: input.amount,
      dueDate,
      invoiceNumber: input.invoiceNumber,
      notes: input.notes,
      status,
    });

    await getJobScheduler().enqueueOverdueCheck(organizationId);
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
    await getJobScheduler().enqueueOverdueCheck(organizationId);

    // Return only the invoices from this batch (bounded by input size) rather than
    // re-reading the whole table.
    const invoiceNumbers = data.map((d) => d.invoiceNumber);
    const invoices = await invoiceRepository.findByInvoiceNumbers(organizationId, invoiceNumbers);
    return invoices.map(toInvoiceDto);
  },

  async update(organizationId: string, id: string, input: UpdateInvoiceInput) {
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
    };

    if (status === "PAID") {
      updateData.paidAt = new Date();
    } else if (input.status === "PENDING" || input.status === "OVERDUE") {
      updateData.paidAt = null;
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
