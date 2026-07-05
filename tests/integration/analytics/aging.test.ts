import { beforeAll, describe, expect, it } from "vitest";
import { resetAndSeed } from "./setup";
import { AS_OF, ORG_ID } from "../../fixtures/analytics/seed";
import { EXPECTED_AGING_PAYABLE, EXPECTED_AGING_RECEIVABLE } from "../../fixtures/analytics/expected";
import { analyticsService } from "@/server/services/analytics.service";

describe("getAgingReport", () => {
  beforeAll(resetAndSeed);

  it("buckets receivables 0-30/31-60/61-90/90+ and computes DSO 86.5", async () => {
    const report = await analyticsService.getAgingReport(ORG_ID, "RECEIVABLE", AS_OF);
    expect(report).toEqual(EXPECTED_AGING_RECEIVABLE);
  });

  it("buckets payables from bills, dso null", async () => {
    const report = await analyticsService.getAgingReport(ORG_ID, "PAYABLE", AS_OF);
    expect(report).toEqual(EXPECTED_AGING_PAYABLE);
  });
});
