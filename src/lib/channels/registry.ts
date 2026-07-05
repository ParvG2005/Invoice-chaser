import type { Channel, ChannelProvider } from "@/lib/channels/channel-provider";

const providers = new Map<Channel, ChannelProvider>();

export function setChannelProvider(channel: Channel, provider: ChannelProvider): void {
  providers.set(channel, provider);
}

export function resetChannelProviders(): void {
  providers.clear();
}

export function getChannelProvider(channel: Channel): ChannelProvider {
  const existing = providers.get(channel);
  if (existing) return existing;
  const created = createDefaultProvider(channel);
  providers.set(channel, created);
  return created;
}

// Replaced with real factories in Tasks 3 and 4.
function createDefaultProvider(channel: Channel): ChannelProvider {
  throw new Error(`No provider registered for channel ${channel}`);
}
