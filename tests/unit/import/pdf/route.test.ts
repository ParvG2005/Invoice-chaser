import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ApiContext } from "@/lib/api/handler";

type MockHandler = (request: Request, context: ApiContext, params: Record<string, string>) => Promise<Response>;

const mockContext: ApiContext = {
  organizationId: "org_1",
  userId: "u1",
  role: "member",
  clerkId: "c1",
};
const mockRouteContext = { params: Promise.resolve({}) };

interface ExtractedInvoiceResult {
  fileName: string;
  method: string;
  needsEmail: boolean;
  warnings: string[];
  invoice?: { invoiceNumber: string };
}

vi.mock("@/lib/api/handler", () => ({
  withApiHandler: (h: MockHandler) => (req: Request) => h(req, mockContext, {}),
}));
vi.mock("@/server/services/party.service", () => ({
  partyService: { list: vi.fn().mockResolvedValue([]) },
}));

import { readFileSync } from "node:fs";
import { POST } from "@/app/api/import/pdf-invoices/parse/route";
import { partyService } from "@/server/services/party.service";

describe("POST /api/import/pdf-invoices/parse", () => {
  beforeEach(() => {
    vi.mocked(partyService.list).mockResolvedValue([]);
  });

  it("returns extracted invoices for uploaded PDFs", async () => {
    const form = new FormData();
    const bytes = readFileSync("tests/fixtures/tally/pdf/AL-104.pdf");
    form.append("files", new Blob([bytes], { type: "application/pdf" }), "AL-104.pdf");
    const res = await POST(
      new Request("http://t/api/import/pdf-invoices/parse", { method: "POST", body: form }),
      mockRouteContext,
    );
    const json = await res.json();
    expect(json.data.results[0].invoice.invoiceNumber).toBe("AL/104");
  });

  it("returns a per-file failure without aborting the batch when extraction throws", async () => {
    vi.resetModules();
    vi.doMock("@/lib/import/pdf", () => ({
      extractInvoicesFromPdf: vi.fn(async (fileName: string) => {
        if (fileName === "bad.pdf") {
          throw new Error("LLM API error: 500");
        }
        return {
          fileName,
          method: "deterministic",
          invoice: { invoiceNumber: "AL/104" },
          invoiceDate: "2024-01-01",
          needsEmail: false,
          warnings: [],
        };
      }),
    }));
    vi.doMock("@/lib/api/handler", () => ({
      withApiHandler: (h: MockHandler) => (req: Request) => h(req, mockContext, {}),
    }));
    vi.doMock("@/server/services/party.service", () => ({
      partyService: { list: vi.fn().mockResolvedValue([]) },
    }));

    const { POST: POSTWithThrow } = await import("@/app/api/import/pdf-invoices/parse/route");

    const form = new FormData();
    const goodBytes = readFileSync("tests/fixtures/tally/pdf/AL-104.pdf");
    form.append("files", new Blob([goodBytes], { type: "application/pdf" }), "bad.pdf");
    form.append("files", new Blob([goodBytes], { type: "application/pdf" }), "good.pdf");

    const res = await POSTWithThrow(
      new Request("http://t/api/import/pdf-invoices/parse", { method: "POST", body: form }),
      mockRouteContext,
    );
    const json: { data: { results: ExtractedInvoiceResult[] } } = await res.json();

    expect(json.data.results).toHaveLength(2);
    const badResult = json.data.results.find((r) => r.fileName === "bad.pdf");
    const goodResult = json.data.results.find((r) => r.fileName === "good.pdf");

    expect(badResult).toBeDefined();
    expect(goodResult).toBeDefined();
    expect(badResult?.method).toBe("failed");
    expect(badResult?.needsEmail).toBe(true);
    expect(badResult?.warnings[0]).toMatch(/LLM API error/);

    expect(goodResult?.method).toBe("deterministic");
    expect(goodResult?.invoice?.invoiceNumber).toBe("AL/104");

    vi.resetModules();
  });
});
