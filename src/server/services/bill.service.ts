import { NotFoundError } from "@/lib/api/errors";
import type { CreateBillInput, UpdateBillInput } from "@/lib/validations/bill";
import { billRepository, type BillListOptions } from "@/server/repositories/bill.repository";
import { partyRepository } from "@/server/repositories/party.repository";
import { computeInvoiceStatus, parseDueDate, toBillDto } from "@/server/services/mappers";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";

export const billService = {
  async list(organizationId: string, options: BillListOptions = {}) {
    const bills = await billRepository.findMany(organizationId, options);
    return bills.map(toBillDto);
  },

  async get(organizationId: string, id: string) {
    const bill = await billRepository.findById(organizationId, id);
    if (!bill) throw new NotFoundError("Bill not found");
    return toBillDto(bill);
  },

  async create(organizationId: string, input: CreateBillInput, actor: AuditActor = SYSTEM_ACTOR) {
    const party = await partyRepository.findById(organizationId, input.partyId);
    if (!party) throw new NotFoundError("Party not found");

    const dueDate = parseDueDate(input.dueDate);
    const status = computeInvoiceStatus(dueDate, input.status);

    return withAudit(actor, "bill.create", { organizationId, entityType: "Bill" }, async () => {
      const bill = await billRepository.create({
        organization: { connect: { id: organizationId } },
        party: { connect: { id: input.partyId } },
        billNumber: input.billNumber,
        billDate: input.billDate ? parseDueDate(input.billDate) : null,
        dueDate,
        amount: input.amount,
        notes: input.notes ?? null,
        status,
        ...(status === "PAID" ? { paidAt: new Date() } : {}),
      });
      return toBillDto(bill);
    });
  },

  async update(
    organizationId: string,
    id: string,
    input: UpdateBillInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const existing = await billRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Bill not found");

    const dueDate = input.dueDate ? parseDueDate(input.dueDate) : existing.dueDate;
    const status = input.status ? input.status : computeInvoiceStatus(dueDate, existing.status);

    return withAudit(
      actor,
      "bill.update",
      { organizationId, entityType: "Bill", entityId: id, before: toBillDto(existing) },
      async () => {
        const updateData: Parameters<typeof billRepository.update>[2] = {
          billNumber: input.billNumber,
          billDate: input.billDate ? parseDueDate(input.billDate) : undefined,
          dueDate: input.dueDate ? dueDate : undefined,
          amount: input.amount,
          notes: input.notes,
          status,
        };
        if (status === "PAID" && existing.status !== "PAID") {
          updateData.paidAt = new Date();
        } else if (existing.status === "PAID" && status !== "PAID") {
          updateData.paidAt = null;
        }
        await billRepository.update(organizationId, id, updateData);
        return this.get(organizationId, id);
      },
    );
  },

  async remove(organizationId: string, id: string, actor: AuditActor = SYSTEM_ACTOR) {
    const existing = await billRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Bill not found");

    return withAudit(
      actor,
      "bill.delete",
      { organizationId, entityType: "Bill", entityId: id, before: toBillDto(existing) },
      async () => {
        const result = await billRepository.softDelete(organizationId, id);
        if (result.count === 0) throw new NotFoundError("Bill not found");
        return { deleted: true as const };
      },
    );
  },
};
