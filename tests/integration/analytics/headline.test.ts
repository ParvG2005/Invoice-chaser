import { beforeAll, describe, expect, it } from "vitest";
import { prisma, resetAndSeed } from "./setup";
import { AS_OF, ORG_ID } from "../../fixtures/analytics/seed";
import { EXPECTED_HEADLINE } from "../../fixtures/analytics/expected";
import { analyticsService } from "@/server/services/analytics.service";

describe("getHeadlineTiles", () => {
  beforeAll(resetAndSeed);

  it("reconciles every tile against hand-computed fixture values", async () => {
    const tiles = await analyticsService.getHeadlineTiles(ORG_ID, AS_OF);
    expect(tiles).toEqual(EXPECTED_HEADLINE);
  });

  it("is org-scoped: another org sees zeros", async () => {
    await prisma.organization.create({ data: { id: "org-other", name: "Other", slug: "other-org" } });
    const tiles = await analyticsService.getHeadlineTiles("org-other", AS_OF);
    expect(tiles).toEqual({
      moneyToCome: 0, moneyToPay: 0,
      pendingInvoices: { count: 0, value: 0 },
      overdueValue: 0, collectedThisMonth: 0,
    });
  });
});
