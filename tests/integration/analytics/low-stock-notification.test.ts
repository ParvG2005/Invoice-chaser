import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetAndSeed } from "./setup";
import { ORG_ID } from "../../fixtures/analytics/seed";
import { setEmailProvider } from "@/lib/email";
import type { SendEmailParams } from "@/lib/email/types";
import { notificationService } from "@/server/services/notification.service";

const sent: SendEmailParams[] = [];

describe("sendLowStockDigest", () => {
  beforeAll(async () => {
    await resetAndSeed();
    const user = await prisma.user.create({
      data: { clerkId: "clerk-fixture-owner", email: "owner@fixture.test", name: "Owner" },
    });
    await prisma.organizationMember.create({
      data: { organizationId: ORG_ID, userId: user.id, role: "owner" },
    });
    setEmailProvider({
      name: "fake",
      async send(params) { sent.push(params); return { id: "fake-1", success: true }; },
    });
  });
  beforeEach(() => { sent.length = 0; });

  it("emails the org owner a digest naming the low-stock item and logs it", async () => {
    const result = await notificationService.sendLowStockDigest(ORG_ID);
    expect(result).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("owner@fixture.test");
    expect(sent[0].subject).toContain("Low stock");
    expect(sent[0].html).toContain("Steel Rod 12mm");
    expect(sent[0].html).not.toContain("Copper Wire");
    const logs = await prisma.emailLog.findMany({ where: { organizationId: ORG_ID } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("SENT");
  });

  it("returns false and sends nothing when no item is low", async () => {
    const org = await prisma.organization.create({
      data: { id: "org-no-stock", name: "NoStock", slug: "no-stock" },
    });
    const result = await notificationService.sendLowStockDigest(org.id);
    expect(result).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
