import { beforeAll, describe, expect, it } from "vitest";
import { resetAndSeed } from "./setup";
import { AS_OF, ORG_ID } from "../../fixtures/analytics/seed";
import { EXPECTED_PARTIES } from "../../fixtures/analytics/expected";
import { analyticsService } from "@/server/services/analytics.service";

describe("getPartyAnalytics", () => {
  beforeAll(resetAndSeed);

  it("computes exposure, days-to-pay, on-time %, flags, and agent leaderboard", async () => {
    const result = await analyticsService.getPartyAnalytics(ORG_ID, AS_OF);
    expect(result).toEqual(EXPECTED_PARTIES);
  });
});
