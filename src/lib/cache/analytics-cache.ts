import { revalidateTag, unstable_cache } from "next/cache";

const TTL_SECONDS = 60;

export const analyticsCacheTag = (organizationId: string) => `analytics:${organizationId}`;

export function cachedAnalytics<T>(
  organizationId: string,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  return unstable_cache(fn, ["analytics", organizationId, key], {
    revalidate: TTL_SECONDS,
    tags: [analyticsCacheTag(organizationId)],
  })();
}

/**
 * `revalidateTag` requires an active request/server-action store — it
 * throws when called from a unit test or a background job runner outside
 * that context. The 60s TTL is the correctness backstop either way, so
 * invalidation here is best-effort, matching the enqueue*BestEffort
 * convention already used for job dispatch in invoice/payment services.
 */
export function invalidateAnalyticsCache(organizationId: string): void {
  try {
    revalidateTag(analyticsCacheTag(organizationId), { expire: 0 });
  } catch (error) {
    console.error("analytics-cache: revalidateTag failed (non-fatal)", error);
  }
}
