import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/import/tally-import.service", () => ({
  tallyImportService: {
    runBatch: vi.fn(),
  },
}));

import { tallyImportService } from "@/server/services/import/tally-import.service";
import { tallyImportWorkflow } from "@/server/workflows/inngest/functions";

describe("tallyImportWorkflow", () => {
  it("runs the batch via tallyImportService.runBatch and returns its result", async () => {
    const result = { id: "b-1", status: "COMPLETED" };
    vi.mocked(tallyImportService.runBatch).mockResolvedValue(result as never);

    const fakeContext = {
      event: { data: { organizationId: "org-1", batchId: "b-1" } },
      step: { run: (_name: string, fn: () => unknown) => fn() },
    };

    // Inngest functions expose their handler via `.fn` in the SDK; call it directly.
    const handler = (
      tallyImportWorkflow as unknown as { fn: (ctx: typeof fakeContext) => Promise<unknown> }
    ).fn;

    const output = await handler(fakeContext);

    expect(tallyImportService.runBatch).toHaveBeenCalledWith("org-1", "b-1");
    expect(output).toEqual(result);
  });
});
