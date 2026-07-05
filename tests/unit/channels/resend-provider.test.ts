import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ResendEmailProvider } from "@/lib/channels/resend-provider";

describe("ResendEmailProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const provider = new ResendEmailProvider("re_test_key", "InvoicePilot <billing@example.com>");

  it("POSTs to the Resend API and returns the message id", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "re_msg_123" }), { status: 200 }),
    );

    const result = await provider.send({
      channel: "EMAIL",
      to: "client@example.com",
      subject: "Payment reminder",
      bodyHtml: "<p>Hi</p>",
      bodyText: "Hi",
    });

    expect(result).toEqual({ providerId: "re_msg_123", success: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body)).toMatchObject({
      from: "InvoicePilot <billing@example.com>",
      to: ["client@example.com"],
      subject: "Payment reminder",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });

  it("throws with the API error body on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid `to`" }), { status: 422 }),
    );
    await expect(
      provider.send({ channel: "EMAIL", to: "bad", subject: "x", bodyHtml: "<p>x</p>" }),
    ).rejects.toThrow(/Resend API error 422/);
  });

  it("rejects a message missing subject or html", async () => {
    await expect(provider.send({ channel: "EMAIL", to: "a@b.co" })).rejects.toThrow(
      /subject and bodyHtml are required/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
