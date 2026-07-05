import type { Prisma, CommunicationStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

const STATUS_RANK: Record<CommunicationStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4,
  BOUNCED: 4,
};

export const communicationLogRepository = {
  create(data: Prisma.CommunicationLogUncheckedCreateInput) {
    return prisma.communicationLog.create({ data });
  },

  update(id: string, data: Prisma.CommunicationLogUncheckedUpdateInput) {
    return prisma.communicationLog.update({ where: { id }, data });
  },

  findByProviderId(channel: "EMAIL" | "WHATSAPP", providerId: string) {
    return prisma.communicationLog.findFirst({ where: { channel, providerId } });
  },

  /** Never downgrade status (e.g. a late DELIVERED after READ). */
  canTransition(from: CommunicationStatus, to: CommunicationStatus): boolean {
    return STATUS_RANK[to] > STATUS_RANK[from];
  },

  listForInvoice(organizationId: string, invoiceId: string) {
    return prisma.communicationLog.findMany({
      where: { organizationId, invoiceId },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Webhook ingress: resolve a party from an inbound WhatsApp phone (last 10 digits). */
  findPartyByPhone(phoneLast10: string) {
    return prisma.party.findFirst({
      where: {
        deletedAt: null,
        OR: [{ whatsapp: { endsWith: phoneLast10 } }, { phone: { endsWith: phoneLast10 } }],
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        emailOptOutAt: true,
        whatsappOptOutAt: true,
      },
    });
  },

  findLatestOpenInvoiceForParty(organizationId: string, partyId: string) {
    return prisma.invoice.findFirst({
      where: { organizationId, partyId, deletedAt: null, status: { not: "PAID" } },
      orderBy: { dueDate: "desc" },
      select: { id: true },
    });
  },

  setPartyOptOut(
    organizationId: string,
    partyId: string,
    field: "emailOptOutAt" | "whatsappOptOutAt",
    value: Date | null,
  ) {
    return prisma.party.updateMany({
      where: { id: partyId, organizationId, deletedAt: null },
      data: { [field]: value },
    });
  },
};
