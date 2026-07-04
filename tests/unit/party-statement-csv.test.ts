import { describe, it, expect } from "vitest";
import { buildStatementCsv, STATEMENT_CSV_HEADER } from "@/app/api/parties/[id]/statement/route";
import type { LedgerEntry } from "@/server/services/party.service";

describe("buildStatementCsv", () => {
  it("emits the exact header row Date,Document,Debit,Credit,Balance", () => {
    const csv = buildStatementCsv([]);
    const [headerLine] = csv.split("\r\n");
    expect(headerLine).toBe(STATEMENT_CSV_HEADER.join(","));
    expect(headerLine).toBe("Date,Document,Debit,Credit,Balance");
  });

  it("formats one row per ledger entry with debit/credit blank when null", () => {
    const ledger: LedgerEntry[] = [
      {
        date: "2026-01-01T00:00:00.000Z",
        docType: "INVOICE",
        docNumber: "E2E-INV-001",
        debit: "10000.00",
        credit: null,
        balance: "10000.00",
      },
      {
        date: "2026-01-05T00:00:00.000Z",
        docType: "PAYMENT",
        docNumber: "PMT-ABC12345",
        debit: null,
        credit: "5000.00",
        balance: "5000.00",
      },
    ];

    const csv = buildStatementCsv(ledger);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Date,Document,Debit,Credit,Balance");
    expect(lines[1]).toBe("2026-01-01T00:00:00.000Z,INVOICE E2E-INV-001,10000.00,,10000.00");
    expect(lines[2]).toBe("2026-01-05T00:00:00.000Z,PAYMENT PMT-ABC12345,,5000.00,5000.00");
  });
});
