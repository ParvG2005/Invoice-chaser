import { NotFoundError, ValidationError } from "@/lib/api/errors";
import type { CreatePartyInput, UpdatePartyInput } from "@/lib/validations/party";
import { partyRepository, type PartyListOptions } from "@/server/repositories/party.repository";
import { toPartyDto } from "@/server/services/mappers";
import { withAudit, SYSTEM_ACTOR, type AuditActor } from "@/server/services/audit.service";

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
};
