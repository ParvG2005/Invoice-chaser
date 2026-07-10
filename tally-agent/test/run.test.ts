import { describe, it, expect, vi } from "vitest";
import { runSync } from "../src/run.ts";

describe("runSync", () => {
  it("uploads ledgers, then stock, then vouchers in order", async () => {
    const calls: string[] = [];
    const deps = {
      fetchTally: vi.fn().mockResolvedValue("<X/>"),
      upload: vi.fn().mockImplementation(async (_a, _k, source) => { calls.push(source); }),
    };
    await runSync(
      { tallyHost: "h", tallyPort: 9000, appUrl: "https://app", apiKey: "k" },
      deps,
    );
    expect(calls).toEqual([
      "TALLY_MASTERS_LEDGERS",
      "TALLY_MASTERS_STOCKITEMS",
      "TALLY_VOUCHERS",
    ]);
  });
});
