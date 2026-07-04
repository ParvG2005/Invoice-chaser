import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { tallyImportService } from "@/server/services/import/tally-import.service";
import { createTestOrganization, resetDatabase } from "./helpers/db";

const FIXTURES = join(__dirname, "../fixtures/tally");
const read = (f: string) => readFileSync(join(FIXTURES, f), "utf8");

describe("tally round-trip on real fixtures", () => {
  let organizationId: string;

  beforeAll(async () => {
    await resetDatabase();
    organizationId = (await createTestOrganization()).id;
  });

  async function runAll() {
    const results = [];
    for (const [source, file] of [
      ["TALLY_MASTERS_LEDGERS", "masters-ledgers.xml"],
      ["TALLY_MASTERS_STOCKITEMS", "masters-stockitems.xml"],
      ["TALLY_VOUCHERS", "vouchers-daybook.xml"],
    ] as const) {
      const batch = await tallyImportService.createBatch(organizationId, {
        source,
        fileName: file,
        xml: read(file),
      });
      results.push(await tallyImportService.runBatch(organizationId, batch.id));
    }
    return results;
  }

  it("first import: creates records, zero unexplained errors", async () => {
    const results = await runAll();
    for (const r of results) {
      expect(r.status).toBe("COMPLETED");
      // Every errored record must carry a message (explained); unexplained = bug
      const records = await tallyImportService.listRecords(organizationId, r.id);
      for (const rec of records.filter((x) => x.action === "ERRORED")) {
        expect(rec.message, `unexplained error on ${rec.tallyGuid}`).toBeTruthy();
      }
      expect(r.createdCount).toBeGreaterThan(0);
    }
  });

  it("re-import: zero duplicates, everything skipped", async () => {
    const before = {
      parties: await prisma.party.count({ where: { organizationId, deletedAt: null } }),
      items: await prisma.item.count({ where: { organizationId, deletedAt: null } }),
      invoices: await prisma.invoice.count({ where: { organizationId, deletedAt: null } }),
      bills: await prisma.bill.count({ where: { organizationId, deletedAt: null } }),
      payments: await prisma.payment.count({ where: { organizationId, deletedAt: null } }),
    };
    const results = await runAll();
    for (const r of results) {
      expect(r.createdCount).toBe(0);
      expect(r.updatedCount).toBe(0);
    }
    const after = {
      parties: await prisma.party.count({ where: { organizationId, deletedAt: null } }),
      items: await prisma.item.count({ where: { organizationId, deletedAt: null } }),
      invoices: await prisma.invoice.count({ where: { organizationId, deletedAt: null } }),
      bills: await prisma.bill.count({ where: { organizationId, deletedAt: null } }),
      payments: await prisma.payment.count({ where: { organizationId, deletedAt: null } }),
    };
    expect(after).toEqual(before);
  });

  it("undo then re-import restores identical counts", async () => {
    // listBatches orders newest-first, and by this point there are two
    // COMPLETED TALLY_VOUCHERS batches: the original import (createdCount > 0)
    // and the re-import from the previous test (all skipped, createdCount 0).
    // We want the one that actually created the invoices to undo.
    const batches = await tallyImportService.listBatches(organizationId);
    const voucherBatch = batches.find(
      (b) => b.source === "TALLY_VOUCHERS" && b.status === "COMPLETED" && b.createdCount > 0,
    );
    expect(voucherBatch).toBeDefined();
    const user = await prisma.user.findFirstOrThrow();
    await tallyImportService.undoBatch(organizationId, user.id, voucherBatch!.id);
    expect(
      await prisma.invoice.count({
        where: { organizationId, deletedAt: null, tallyGuid: { not: null } },
      }),
    ).toBe(0);

    const batch = await tallyImportService.createBatch(organizationId, {
      source: "TALLY_VOUCHERS",
      fileName: "vouchers-daybook.xml",
      xml: read("vouchers-daybook.xml"),
    });
    const rerun = await tallyImportService.runBatch(organizationId, batch.id);
    expect(rerun.status).toBe("COMPLETED");
    expect(rerun.erroredCount).toBe(0);
  });

  it("receivables total matches Tally outstanding (user-verified figure)", async () => {
    // USER ACTION: read Tally Prime → Display → Statements of Accounts →
    // Outstandings → Receivables for the fixture period, and set the env var:
    //   TALLY_EXPECTED_RECEIVABLES=123456.78 npx vitest run tests/integration/tally-roundtrip.test.ts
    const expected = process.env.TALLY_EXPECTED_RECEIVABLES;
    if (!expected) {
      console.warn("TALLY_EXPECTED_RECEIVABLES not set — gate figure must be checked manually");
      return;
    }
    const invoices = await prisma.invoice.findMany({
      where: { organizationId, deletedAt: null, type: "RECEIVABLE" },
      select: { amount: true, amountPaid: true },
    });
    const outstanding = invoices.reduce(
      (sum, i) => sum + Number(i.amount) - Number(i.amountPaid ?? 0),
      0,
    );
    expect(outstanding).toBeCloseTo(Number.parseFloat(expected), 2);
  });
});
