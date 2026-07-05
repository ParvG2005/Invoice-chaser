import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/server/repositories/communication-log.repository", () => ({
  communicationLogRepository: {
    create: vi.fn(),
    update: vi.fn(),
    findByProviderId: vi.fn(),
    canTransition: (from: string, to: string) => {
      const rank: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, BOUNCED: 4 };
      return rank[to] > rank[from];
    },
    listForInvoice: vi.fn(),
    findPartyByPhone: vi.fn(),
    findLatestOpenInvoiceForParty: vi.fn(),
    setPartyOptOut: vi.fn(),
  },
}));

vi.mock("@/server/services/audit.service", () => ({
  withAudit: (_actor: unknown, _action: string, _entity: unknown, fn: () => Promise<unknown>) => fn(),
}));

import { communicationService } from "@/server/services/communication.service";
import { communicationLogRepository } from "@/server/repositories/communication-log.repository";
import { setChannelProvider, resetChannelProviders } from "@/lib/channels/registry";

const repo = vi.mocked(communicationLogRepository);
const SYSTEM = { type: "SYSTEM" as const, id: null };

describe("communicationService.sendOutbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChannelProviders();
    repo.create.mockResolvedValue({ id: "log-1" } as never);
    repo.update.mockResolvedValue({ id: "log-1" } as never);
  });

  it("creates a QUEUED log, sends via the channel provider, marks SENT", async () => {
    const send = vi.fn().mockResolvedValue({ providerId: "re_1", success: true });
    setChannelProvider("EMAIL", { name: "mock", channel: "EMAIL", send });

    const result = await communicationService.sendOutbound("org-1", SYSTEM, {
      channel: "EMAIL",
      to: "a@b.co",
      subject: "Reminder",
      bodyHtml: "<p>hi</p>",
      invoiceId: "inv-1",
      reminderId: "rem-1",
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", channel: "EMAIL", status: "QUEUED", invoiceId: "inv-1" }),
    );
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.co", subject: "Reminder" }));
    expect(repo.update).toHaveBeenCalledWith("log-1", expect.objectContaining({ status: "SENT", providerId: "re_1" }));
    expect(result).toEqual({ id: "log-1", status: "SENT", providerId: "re_1" });
  });

  it("marks the log FAILED and rethrows when the provider throws", async () => {
    setChannelProvider("EMAIL", {
      name: "mock",
      channel: "EMAIL",
      send: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await expect(
      communicationService.sendOutbound("org-1", SYSTEM, { channel: "EMAIL", to: "a@b.co", subject: "x", bodyHtml: "y" }),
    ).rejects.toThrow("boom");
    expect(repo.update).toHaveBeenCalledWith("log-1", expect.objectContaining({ status: "FAILED", errorMessage: "boom" }));
  });
});

describe("communicationService.handleProviderStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upgrades status by providerId and stamps the timestamp", async () => {
    repo.findByProviderId.mockResolvedValue({ id: "log-1", status: "SENT" } as never);
    const at = new Date("2026-07-03T10:00:00Z");
    const res = await communicationService.handleProviderStatus("EMAIL", "re_1", "DELIVERED", at);
    expect(res).toEqual({ updated: true });
    expect(repo.update).toHaveBeenCalledWith("log-1", expect.objectContaining({ status: "DELIVERED", deliveredAt: at }));
  });

  it("ignores unknown providerIds and downgrades", async () => {
    repo.findByProviderId.mockResolvedValue(null);
    expect(await communicationService.handleProviderStatus("EMAIL", "nope", "DELIVERED", new Date())).toEqual({ updated: false });

    repo.findByProviderId.mockResolvedValue({ id: "log-1", status: "READ" } as never);
    expect(await communicationService.handleProviderStatus("EMAIL", "re_1", "DELIVERED", new Date())).toEqual({ updated: false });
  });
});

describe("communicationService.recordInbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.create.mockResolvedValue({ id: "log-in-1" } as never);
  });

  it("logs an inbound reply linked to the party's latest open invoice", async () => {
    repo.findPartyByPhone.mockResolvedValue({ id: "p1", organizationId: "org-1", name: "Acme" } as never);
    repo.findLatestOpenInvoiceForParty.mockResolvedValue({ id: "inv-9" } as never);

    const res = await communicationService.recordInbound({
      channel: "WHATSAPP",
      from: "+91 98765 43210",
      body: "Will pay Friday",
      providerId: "wamid.IN1",
      receivedAt: new Date(),
    });

    expect(repo.findPartyByPhone).toHaveBeenCalledWith("9876543210");
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "INBOUND", organizationId: "org-1", partyId: "p1", invoiceId: "inv-9", body: "Will pay Friday" }),
    );
    expect(res).toEqual({ logId: "log-in-1", optOut: false });
  });

  it("treats STOP as a WhatsApp opt-out", async () => {
    repo.findPartyByPhone.mockResolvedValue({ id: "p1", organizationId: "org-1", name: "Acme" } as never);
    repo.findLatestOpenInvoiceForParty.mockResolvedValue(null);
    repo.setPartyOptOut.mockResolvedValue({ count: 1 } as never);

    const res = await communicationService.recordInbound({
      channel: "WHATSAPP",
      from: "919876543210",
      body: "  STOP ",
      providerId: "wamid.IN2",
      receivedAt: new Date(),
    });

    expect(repo.setPartyOptOut).toHaveBeenCalledWith("org-1", "p1", "whatsappOptOutAt", expect.any(Date));
    expect(res.optOut).toBe(true);
  });

  it("drops messages from unknown numbers", async () => {
    repo.findPartyByPhone.mockResolvedValue(null);
    const res = await communicationService.recordInbound({
      channel: "WHATSAPP", from: "10000000000", body: "hi", providerId: "wamid.IN3", receivedAt: new Date(),
    });
    expect(res).toEqual({ logId: null, optOut: false });
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("communicationService.resolveChannels", () => {
  const settings = { enabledChannels: ["EMAIL", "WHATSAPP"] as const };
  const contact = { email: "a@b.co", phone: "+919876543210" };

  it("returns org channels when party has no preference", () => {
    expect(
      communicationService.resolveChannels({ enabledChannels: [...settings.enabledChannels] }, null, contact),
    ).toEqual(["EMAIL", "WHATSAPP"]);
  });

  it("intersects party preference, drops opted-out and address-less channels", () => {
    const party = { preferredChannels: ["WHATSAPP" as const], emailOptOutAt: null, whatsappOptOutAt: null };
    expect(communicationService.resolveChannels({ enabledChannels: ["EMAIL", "WHATSAPP"] }, party, contact)).toEqual(["WHATSAPP"]);

    const optedOut = { preferredChannels: [], emailOptOutAt: new Date(), whatsappOptOutAt: null };
    expect(communicationService.resolveChannels({ enabledChannels: ["EMAIL", "WHATSAPP"] }, optedOut, contact)).toEqual(["WHATSAPP"]);

    expect(
      communicationService.resolveChannels({ enabledChannels: ["EMAIL", "WHATSAPP"] }, null, { email: "a@b.co", phone: null }),
    ).toEqual(["EMAIL"]);
  });
});
