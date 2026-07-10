import { describe, it, expect, vi } from "vitest";
import { uploadDoc } from "../src/uploader.ts";

describe("uploadDoc", () => {
  it("POSTs the doc with bearer auth and the correct body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    await uploadDoc("https://app", "oc_live_x", "TALLY_MASTERS_LEDGERS", "ledgers.xml", "<X/>", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("https://app/api/import/tally", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer oc_live_x", "content-type": "application/json" }),
    }));
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toEqual({ source: "TALLY_MASTERS_LEDGERS", fileName: "ledgers.xml", xml: "<X/>" });
  });

  it("throws on 4xx without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(uploadDoc("https://app", "bad", "TALLY_VOUCHERS", "v.xml", "<X/>", fetchImpl)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx then succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 202 });
    await uploadDoc("https://app", "oc_live_x", "TALLY_VOUCHERS", "v.xml", "<X/>", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
