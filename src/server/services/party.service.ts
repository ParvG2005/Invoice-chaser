import { NotFoundError, ValidationError } from "@/lib/api/errors";
import type { CreatePartyInput, UpdatePartyInput } from "@/lib/validations/party";
import { partyRepository, type PartyListOptions } from "@/server/repositories/party.repository";
import { toPartyDto } from "@/server/services/mappers";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";
import { decimalToNumber } from "@/lib/utils/currency";

export interface LedgerEntry {
  date: string;
  docType: "INVOICE" | "BILL" | "PAYMENT";
  docNumber: string;
  debit: string | null;
  credit: string | null;
  balance: string;
}

export interface AgentRollupEntry {
  party: { id: string; name: string };
  outstanding: string;
}

async function assertValidAgent(organizationId: string, agentId: string) {
  const agent = await partyRepository.findById(organizationId, agentId);
  if (!agent || (agent.type !== "AGENT" && agent.type !== "BOTH")) {
    throw new ValidationError("agentId must reference an AGENT or BOTH party in this organization");
  }
}

export const partyService = {
  async list(organizationId: string, options: PartyListOptions = {}) {
    const parties = await partyRepository.findMany(organizationId, options);
    return parties.map(toPartyDto);
  },

  async get(organizationId: string, id: string) {
    const party = await partyRepository.findById(organizationId, id);
    if (!party) throw new NotFoundError("Party not found");
    return toPartyDto(party);
  },

  async create(organizationId: string, input: CreatePartyInput, actor: AuditActor = SYSTEM_ACTOR) {
    const duplicate = await partyRepository.findByName(organizationId, input.name);
    if (duplicate) throw new ValidationError("A party with this name already exists");
    if (input.agentId) await assertValidAgent(organizationId, input.agentId);

    return withAudit(actor, "party.create", { organizationId, entityType: "Party" }, async () => {
      const party = await partyRepository.create({
        organization: { connect: { id: organizationId } },
        type: input.type,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        whatsapp: input.whatsapp ?? null,
        gstin: input.gstin ?? null,
        billingAddress: input.billingAddress ?? null,
        creditLimit: input.creditLimit ?? null,
        creditDays: input.creditDays ?? null,
        openingBalance: input.openingBalance ?? null,
        notes: input.notes ?? null,
        tallyGuid: input.tallyGuid ?? null,
        tallyAlterId: input.tallyAlterId ?? null,
        ...(input.agentId ? { agent: { connect: { id: input.agentId } } } : {}),
      });
      return toPartyDto(party);
    });
  },

  async update(
    organizationId: string,
    id: string,
    input: UpdatePartyInput,
    actor: AuditActor = SYSTEM_ACTOR,
  ) {
    const existing = await partyRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Party not found");

    if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await partyRepository.findByName(organizationId, input.name);
      if (duplicate) throw new ValidationError("A party with this name already exists");
    }
    if (input.agentId) await assertValidAgent(organizationId, input.agentId);

    return withAudit(
      actor,
      "party.update",
      { organizationId, entityType: "Party", entityId: id, before: toPartyDto(existing) },
      async () => {
        await partyRepository.update(organizationId, id, {
          type: input.type,
          name: input.name,
          email: input.email,
          phone: input.phone,
          whatsapp: input.whatsapp,
          gstin: input.gstin,
          billingAddress: input.billingAddress,
          creditLimit: input.creditLimit,
          creditDays: input.creditDays,
          openingBalance: input.openingBalance,
          notes: input.notes,
          agentId: input.agentId,
          tallyGuid: input.tallyGuid,
          tallyAlterId: input.tallyAlterId,
        });
        return this.get(organizationId, id);
      },
    );
  },

  async remove(organizationId: string, id: string, actor: AuditActor = SYSTEM_ACTOR) {
    const existing = await partyRepository.findById(organizationId, id);
    if (!existing) throw new NotFoundError("Party not found");

    return withAudit(
      actor,
      "party.delete",
      { organizationId, entityType: "Party", entityId: id, before: toPartyDto(existing) },
      async () => {
        const result = await partyRepository.softDelete(organizationId, id);
        if (result.count === 0) throw new NotFoundError("Party not found");
        return { deleted: true as const };
      },
    );
  },

  /**
   * Chronological statement of a party's invoices/bills/payments with a
   * running balance, for the party detail ledger table and CSV/PDF
   * statement export (Task 17). The running balance starts from
   * `party.openingBalance` (default 0) — it is not emitted as its own row
   * since `LedgerEntry.docType` only spans INVOICE/BILL/PAYMENT.
   *
   * Debit/credit sign convention: for CUSTOMER (or BOTH) parties, invoices
   * increase what they owe us (debit); for SUPPLIER (or BOTH) parties,
   * bills increase what we owe them (debit). Payments always reduce the
   * balance (credit) — a party only ever has IN payments (customer paying
   * us) or OUT payments (us paying a supplier), so the direction is
   * already implied by which party the payment is attached to.
   */
  async ledger(organizationId: string, partyId: string): Promise<LedgerEntry[]> {
    const party = await partyRepository.findByIdWithLedgerRelations(organizationId, partyId);
    if (!party) throw new NotFoundError("Party not found");

    const includeInvoicesAsDebit = party.type === "CUSTOMER" || party.type === "BOTH";
    const includeBillsAsDebit = party.type === "SUPPLIER" || party.type === "BOTH";

    interface RawEntry {
      date: Date;
      docType: LedgerEntry["docType"];
      docNumber: string;
      debit: number;
      credit: number;
    }

    const raw: RawEntry[] = [];

    if (includeInvoicesAsDebit) {
      for (const invoice of party.invoices) {
        raw.push({
          date: invoice.createdAt,
          docType: "INVOICE",
          docNumber: invoice.invoiceNumber,
          debit: decimalToNumber(invoice.totalAmount ?? invoice.amount),
          credit: 0,
        });
      }
    }

    if (includeBillsAsDebit) {
      for (const bill of party.bills) {
        raw.push({
          date: bill.billDate ?? bill.createdAt,
          docType: "BILL",
          docNumber: bill.billNumber,
          debit: decimalToNumber(bill.amount),
          credit: 0,
        });
      }
    }

    for (const payment of party.payments) {
      raw.push({
        date: payment.paymentDate,
        docType: "PAYMENT",
        docNumber: payment.reference ?? `PMT-${payment.id.slice(0, 8).toUpperCase()}`,
        debit: 0,
        credit: decimalToNumber(payment.amount),
      });
    }

    // Stable sort by date — ties (e.g. same-instant seed data) keep the
    // insertion order above (invoices, then bills, then payments).
    raw.sort((a, b) => a.date.getTime() - b.date.getTime());

    let balance = party.openingBalance ? decimalToNumber(party.openingBalance) : 0;
    return raw.map((entry) => {
      balance += entry.debit - entry.credit;
      return {
        date: entry.date.toISOString(),
        docType: entry.docType,
        docNumber: entry.docNumber,
        debit: entry.debit ? entry.debit.toFixed(2) : null,
        credit: entry.credit ? entry.credit.toFixed(2) : null,
        balance: balance.toFixed(2),
      };
    });
  },

  /**
   * For an AGENT (or BOTH) party, the parties they manage
   * (`party.agentId === agentPartyId`) with each one's outstanding balance
   * (sum of unpaid invoice/bill amounts), for the party detail page's
   * "Managed parties" rollup (Task 17).
   */
  async agentRollup(organizationId: string, agentPartyId: string): Promise<AgentRollupEntry[]> {
    const agent = await partyRepository.findById(organizationId, agentPartyId);
    if (!agent) throw new NotFoundError("Party not found");

    const managedParties = await partyRepository.findManagedParties(organizationId, agentPartyId);

    return managedParties.map((party) => {
      let outstanding = 0;
      for (const invoice of party.invoices) {
        const total = decimalToNumber(invoice.totalAmount ?? invoice.amount);
        outstanding += total - decimalToNumber(invoice.amountPaid);
      }
      for (const bill of party.bills) {
        outstanding += decimalToNumber(bill.amount) - decimalToNumber(bill.amountPaid);
      }
      return {
        party: { id: party.id, name: party.name },
        outstanding: outstanding.toFixed(2),
      };
    });
  },
};
