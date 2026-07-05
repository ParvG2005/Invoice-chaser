import { beforeAll, describe, expect, it } from "vitest";
import { resetAndSeed } from "./setup";
import { AS_OF, ORG_ID } from "../../fixtures/analytics/seed";
import { EXPECTED_CASHFLOW, EXPECTED_TREND } from "../../fixtures/analytics/expected";
import { analyticsService } from "@/server/services/analytics.service";

describe("collection trend + cashflow projection", () => {
  beforeAll(resetAndSeed);

  it("computes 6-month invoiced/collected/rate series", async () => {
    const trend = await analyticsService.getCollectionTrend(ORG_ID, AS_OF);
    expect(trend).toEqual(EXPECTED_TREND);
  });

  it("projects weekly cashflow from due dates with an overdue bucket", async () => {
    const projection = await analyticsService.getCashflowProjection(ORG_ID, AS_OF);
    expect(projection).toEqual(EXPECTED_CASHFLOW);
  });
});
