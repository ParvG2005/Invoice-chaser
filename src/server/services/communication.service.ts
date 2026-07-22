import type { CommunicationStatus, CommunicationChannel } from "@/generated/prisma/client";
import { getChannelProvider } from "@/lib/channels/registry";
import type { Channel } from "@/lib/channels/channel-provider";
import { createLogger } from "@/lib/logger";
import { NotFoundError } from "@/lib/api/errors";
import { communicationLogRepository } from "@/server/repositories/communication-log.repository";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { organizationRepository } from "@/server/repositories/organization.repository";
import { withAudit, type AuditActor } from "@/server/services/audit.service";
import { renderBaseEmailTemplate, textToHtmlParagraphs } from "@/lib/email/templates/base";
import { isDemoOrg } from "@/lib/demo";
import { decimalToNumber, formatInr } from "@/lib/utils/currency";
import type { CommunicationLogDto } from "@/types";

const log = createLogger("communication-service");

export interface SendOutboundInput {
  channel: Channel;
  to: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  templateId?: string;
  templateParams?: string[];
  partyId?: string;
  invoiceId?: string;
  reminderId?: string;
}

export interface SendOutboundResult {
  id: string;
  status: "SENT" | "FAILED";
  providerId: string | null;
}

export interface InboundMessageInput {
  channel: Channel;
  from: string;
  body: string;
  providerId: string;
  receivedAt: Date;
}

export interface ChannelSettings {
  enabledChannels: Channel[];
}

export interface PartyChannelInfo {
  preferredChannels: Channel[];
  emailOptOutAt: Date | null;
  whatsappOptOutAt: Date | null;
}

const OPT_OUT_KEYWORDS = new Set(["stop", "unsubscribe", "opt out", "optout", "stop all"]);

const TIMESTAMP_FIELD: Partial<Record<CommunicationStatus, "sentAt" | "deliveredAt" | "readAt">> = {
  SENT: "sentAt",
  DELIVERED: "deliveredAt",
  READ: "readAt",
};

function phoneLast10(raw: string): string {
  return raw.replace(/[^\d]/g, "").slice(-10);
}

function toDto(row: {
  id: string;
  channel: CommunicationChannel;
  direction: "OUTBOUND" | "INBOUND";
  toAddress: string;
  subject: string | null;
  body: string | null;
  templateId: string | null;
  status: CommunicationStatus;
  providerId: string | null;
  invoiceId: string | null;
  reminderId: string | null;
  partyId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
}): CommunicationLogDto {
  return {
    id: row.id,
    channel: row.channel,
    direction: row.direction,
    to: row.toAddress,
    subject: row.subject,
    body: row.body,
    templateId: row.templateId,
    status: row.status,
    providerId: row.providerId,
    invoiceId: row.invoiceId,
    reminderId: row.reminderId,
    partyId: row.partyId,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
  };
}

export const communicationService = {
  async sendOutbound(
    organizationId: string,
    actor: AuditActor,
    input: SendOutboundInput,
  ): Promise<SendOutboundResult> {
    const entry = await communicationLogRepository.create({
      organizationId,
      channel: input.channel as CommunicationChannel,
      direction: "OUTBOUND",
      toAddress: input.to,
      subject: input.subject ?? null,
      body: input.bodyText ?? input.bodyHtml ?? null,
      templateId: input.templateId ?? null,
      status: "QUEUED",
      partyId: input.partyId ?? null,
      invoiceId: input.invoiceId ?? null,
      reminderId: input.reminderId ?? null,
    });

    return withAudit(actor, "communication.send", { organizationId, entityType: "CommunicationLog", entityId: entry.id }, async () => {
      try {
        // Demo org: never touch the real provider — interviewer clicks must not
        // reach real inboxes. Mark the log SENT so the UI reflects a send.
        if (await isDemoOrg(organizationId)) {
          log.info("Demo org — skipping real send", { organizationId, channel: input.channel });
          await communicationLogRepository.update(entry.id, {
            status: "SENT",
            providerId: "demo-skip",
            sentAt: new Date(),
          });
          return { id: entry.id, status: "SENT" as const, providerId: "demo-skip" };
        }
        const provider = getChannelProvider(input.channel);
        const result = await provider.send({
          channel: input.channel,
          to: input.to,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          bodyText: input.bodyText,
          templateId: input.templateId,
          templateParams: input.templateParams,
        });
        await communicationLogRepository.update(entry.id, {
          status: "SENT",
          providerId: result.providerId,
          sentAt: new Date(),
        });
        return { id: entry.id, status: "SENT" as const, providerId: result.providerId };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Send failed";
        await communicationLogRepository.update(entry.id, { status: "FAILED", errorMessage: message });
        throw error;
      }
    });
  },

  async handleProviderStatus(
    channel: Channel,
    providerId: string,
    status: CommunicationStatus,
    occurredAt: Date,
    errorMessage?: string,
  ): Promise<{ updated: boolean }> {
    const entry = await communicationLogRepository.findByProviderId(channel, providerId);
    if (!entry) {
      log.warn("Webhook for unknown providerId", { channel, providerId });
      return { updated: false };
    }
    if (!communicationLogRepository.canTransition(entry.status, status)) {
      return { updated: false };
    }
    const tsField = TIMESTAMP_FIELD[status];
    await communicationLogRepository.update(entry.id, {
      status,
      ...(tsField ? { [tsField]: occurredAt } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    });
    return { updated: true };
  },

  async recordInbound(input: InboundMessageInput): Promise<{ logId: string | null; optOut: boolean }> {
    const party = await communicationLogRepository.findPartyByPhone(phoneLast10(input.from));
    if (!party) {
      log.warn("Inbound message from unknown number", { channel: input.channel });
      return { logId: null, optOut: false };
    }

    const isOptOut = OPT_OUT_KEYWORDS.has(input.body.trim().toLowerCase());
    if (isOptOut) {
      await communicationLogRepository.setPartyOptOut(
        party.organizationId,
        party.id,
        input.channel === "WHATSAPP" ? "whatsappOptOutAt" : "emailOptOutAt",
        new Date(),
      );
    }

    const invoice = await communicationLogRepository.findLatestOpenInvoiceForParty(
      party.organizationId,
      party.id,
    );

    const entry = await communicationLogRepository.create({
      organizationId: party.organizationId,
      channel: input.channel as CommunicationChannel,
      direction: "INBOUND",
      toAddress: input.from,
      body: input.body,
      status: "DELIVERED",
      providerId: input.providerId,
      partyId: party.id,
      invoiceId: invoice?.id ?? null,
      createdAt: input.receivedAt,
    });

    return { logId: entry.id, optOut: isOptOut };
  },

  async setOptOut(
    organizationId: string,
    actor: AuditActor,
    partyId: string,
    channel: Channel,
    optedOut: boolean,
  ): Promise<void> {
    await withAudit(actor, "communication.opt-out", { organizationId, entityType: "Party", entityId: partyId }, async () => {
      const result = await communicationLogRepository.setPartyOptOut(
        organizationId,
        partyId,
        channel === "WHATSAPP" ? "whatsappOptOutAt" : "emailOptOutAt",
        optedOut ? new Date() : null,
      );
      if (result.count === 0) throw new NotFoundError("Party not found");
    });
  },

  async listForInvoice(organizationId: string, invoiceId: string): Promise<CommunicationLogDto[]> {
    const rows = await communicationLogRepository.listForInvoice(organizationId, invoiceId);
    return rows.map(toDto);
  },

  resolveChannels(
    settings: ChannelSettings,
    party: PartyChannelInfo | null,
    contact: { email: string | null; phone: string | null },
  ): Channel[] {
    let channels = [...settings.enabledChannels];
    if (party?.preferredChannels.length) {
      channels = channels.filter((c) => party.preferredChannels.includes(c));
    }
    return channels.filter((c) => {
      if (c === "EMAIL") return !party?.emailOptOutAt && !!contact.email;
      return !party?.whatsappOptOutAt && !!contact.phone;
    });
  },

  /**
   * Email-only in Phase 4 (WhatsApp provider task dropped): resolveChannels may still
   * return "WHATSAPP" if org/party settings allow it (schema unchanged), but only the
   * EMAIL branch is sent — anything else is skipped rather than crashing.
   */
  async sendPaidThankYou(organizationId: string, invoiceId: string): Promise<{ sent: Channel[] }> {
    const invoice = await invoiceRepository.findById(organizationId, invoiceId);
    if (!invoice) throw new NotFoundError("Invoice not found");
    const org = await organizationRepository.findById(organizationId);
    if (!org) throw new NotFoundError("Organization not found");

    const settings = org.reminderSettings;
    const enabledChannels: Channel[] = settings?.enabledChannels?.length
      ? settings.enabledChannels
      : ["EMAIL"];
    const party = invoice.party ?? null; // Phase 1 relation; null for legacy invoices
    const contact = {
      email: party?.email ?? invoice.clientEmail ?? null,
      phone: party?.whatsapp ?? party?.phone ?? invoice.clientPhone ?? null,
    };
    const channels = this.resolveChannels(
      { enabledChannels },
      party
        ? {
            preferredChannels: party.preferredChannels ?? [],
            emailOptOutAt: party.emailOptOutAt ?? null,
            whatsappOptOutAt: party.whatsappOptOutAt ?? null,
          }
        : null,
      contact,
    );

    const amount = formatInr(decimalToNumber(invoice.amount));
    const clientName = party?.name ?? invoice.clientName;
    const sent: Channel[] = [];
    const actor: AuditActor = { type: "SYSTEM", id: null };

    for (const channel of channels.filter((c) => c === "EMAIL")) {
      try {
        const bodyText = `Hi ${clientName},\n\nThank you! We have received your payment of ${amount} for invoice ${invoice.invoiceNumber}.\n\nRegards,\n${org.name}`;
        await this.sendOutbound(organizationId, actor, {
          channel,
          to: contact.email!,
          subject: `Payment received — ${invoice.invoiceNumber}`,
          bodyHtml: renderBaseEmailTemplate({
            title: "Payment received",
            bodyHtml: textToHtmlParagraphs(bodyText),
          }),
          bodyText,
          invoiceId,
          partyId: party?.id,
        });
        sent.push(channel);
      } catch (error) {
        log.error("Thank-you send failed", {
          channel,
          invoiceId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
    return { sent };
  },
};
