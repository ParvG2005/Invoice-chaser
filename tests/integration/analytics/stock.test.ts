import { beforeAll, describe, expect, it } from "vitest";
import { resetAndSeed } from "./setup";
import { AS_OF, ORG_ID } from "../../fixtures/analytics/seed";
import { EXPECTED_STOCK } from "../../fixtures/analytics/expected";
import { analyticsService } from "@/server/services/analytics.service";

describe("getStockAnalytics", () => {
  beforeAll(resetAndSeed);

  it("computes qty, valuation, low/dead stock, and movement trend", async () => {
    const result = await analyticsService.getStockAnalytics(ORG_ID, AS_OF);
    expect(result).toEqual(EXPECTED_STOCK);
  });
});
