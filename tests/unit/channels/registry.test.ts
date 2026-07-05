import { describe, it, expect, beforeEach } from "vitest";
import { setChannelProvider, getChannelProvider, resetChannelProviders } from "@/lib/channels/registry";
import type { ChannelProvider, OutboundMessage, SendResult } from "@/lib/channels/channel-provider";

const mockProvider = (channel: "EMAIL" | "WHATSAPP"): ChannelProvider => ({
  name: `mock-${channel.toLowerCase()}`,
  channel,
  async send(_msg: OutboundMessage): Promise<SendResult> {
    return { providerId: "mock-1", success: true };
  },
});

describe("channel registry", () => {
  beforeEach(() => resetChannelProviders());

  it("returns an injected provider for its channel", async () => {
    setChannelProvider("EMAIL", mockProvider("EMAIL"));
    const p = getChannelProvider("EMAIL");
    expect(p.channel).toBe("EMAIL");
    await expect(p.send({ channel: "EMAIL", to: "a@b.co" })).resolves.toEqual({
      providerId: "mock-1",
      success: true,
    });
  });

  it("keeps providers independent per channel", () => {
    setChannelProvider("EMAIL", mockProvider("EMAIL"));
    setChannelProvider("WHATSAPP", mockProvider("WHATSAPP"));
    expect(getChannelProvider("WHATSAPP").name).toBe("mock-whatsapp");
    expect(getChannelProvider("EMAIL").name).toBe("mock-email");
  });
});
