import { describe, it, expect, vi } from "vitest";
import { uploadDoc } from "../src/uploader.ts";

describe("uploadDoc", () => {
  it("POSTs the doc with bearer auth and the correct body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    await uploadDoc("https://app", "oc_live_x", "TALLY_MASTERS_LEDGERS", "ledgers.xml", "<X/>", undefined, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("https://app/api/import/tally", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer oc_live_x", "content-type": "application/json" }),
    }));
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toEqual({ source: "TALLY_MASTERS_LEDGERS", fileName: "ledgers.xml", xml: "<X/>" });
  });

  it("adds the Vercel protection-bypass header when a secret is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    await uploadDoc("https://app", "oc_live_x", "TALLY_MASTERS_LEDGERS", "ledgers.xml", "<X/>", "sekret", fetchImpl);
    expect(fetchImpl.mock.calls[0][1].headers["x-vercel-protection-bypass"]).toBe("sekret");
  });

  it("omits the bypass header when no secret is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    await uploadDoc("https://app", "oc_live_x", "TALLY_MASTERS_LEDGERS", "ledgers.xml", "<X/>", undefined, fetchImpl);
    expect("x-vercel-protection-bypass" in fetchImpl.mock.calls[0][1].headers).toBe(false);
  });

  it("throws on 4xx without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(uploadDoc("https://app", "bad", "TALLY_VOUCHERS", "v.xml", "<X/>", undefined, fetchImpl)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx then succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 202 });
    await uploadDoc("https://app", "oc_live_x", "TALLY_VOUCHERS", "v.xml", "<X/>", undefined, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
