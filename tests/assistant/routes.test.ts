import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "clerk-1" }),
}));

vi.mock("@/server/services/organization.service", () => ({
  organizationService: { ensureUserOrganization: vi.fn() },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/server/services/assistant.service", () => ({
  assistantService: {
    listSessions: vi.fn(),
    createSession: vi.fn(),
    getHistory: vi.fn(),
    approveAction: vi.fn(),
    rejectAction: vi.fn(),
  },
}));

vi.mock("@/lib/assistant/client", () => ({
  runAssistantTurn: vi.fn(),
}));

vi.mock("@/lib/assistant/budget", () => ({
  checkAssistantRateLimit: vi.fn().mockResolvedValue(true),
  assertTokenBudget: vi.fn().mockResolvedValue(undefined),
  recordTokenUsage: vi.fn().mockResolvedValue(undefined),
}));

import { organizationService } from "@/server/services/organization.service";
import { assistantService } from "@/server/services/assistant.service";
import { runAssistantTurn } from "@/lib/assistant/client";
import { checkAssistantRateLimit, assertTokenBudget, recordTokenUsage } from "@/lib/assistant/budget";
import type { AssistantStreamEvent } from "@/lib/assistant/client";

import { POST as createSession, GET as listSessions } from "@/app/api/assistant/sessions/route";
import {
  GET as getMessages,
  POST as postMessage,
} from "@/app/api/assistant/sessions/[id]/messages/route";
import { POST as approveAction } from "@/app/api/assistant/actions/[id]/approve/route";
import { POST as rejectAction } from "@/app/api/assistant/actions/[id]/reject/route";

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, { method, body: JSON.stringify(body) });
}

function routeContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

const ORG_CTX = {
  userId: "user-1",
  organizationId: "org-1",
  organization: { id: "org-1" },
  role: "member",
};

describe("assistant API routes", () => {
  const originalKillSwitch = process.env.ASSISTANT_KILL_SWITCH;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ASSISTANT_KILL_SWITCH;
    vi.mocked(organizationService.ensureUserOrganization).mockResolvedValue(ORG_CTX as never);
    vi.mocked(checkAssistantRateLimit).mockResolvedValue(true);
    vi.mocked(assertTokenBudget).mockResolvedValue(undefined);
    vi.mocked(recordTokenUsage).mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalKillSwitch === undefined) delete process.env.ASSISTANT_KILL_SWITCH;
    else process.env.ASSISTANT_KILL_SWITCH = originalKillSwitch;
  });

  describe("kill switch", () => {
    it("returns 503 for POST /sessions without touching assistantService", async () => {
      process.env.ASSISTANT_KILL_SWITCH = "true";

      const res = await createSession(
        jsonRequest("http://test/api/assistant/sessions", {}),
        routeContext({}),
      );

      expect(res.status).toBe(503);
      expect(assistantService.createSession).not.toHaveBeenCalled();
    });

    it("returns 503 for POST /sessions/:id/messages without touching model/budget", async () => {
      process.env.ASSISTANT_KILL_SWITCH = "true";

      const res = await postMessage(
        jsonRequest("http://test/api/assistant/sessions/s1/messages", { text: "hi" }),
        routeContext({ id: "s1" }),
      );

      expect(res.status).toBe(503);
      expect(runAssistantTurn).not.toHaveBeenCalled();
      expect(checkAssistantRateLimit).not.toHaveBeenCalled();
      expect(assertTokenBudget).not.toHaveBeenCalled();
      expect(assistantService.getHistory).not.toHaveBeenCalled();
    });

    it("returns 503 for POST /actions/:id/approve without touching assistantService", async () => {
      process.env.ASSISTANT_KILL_SWITCH = "true";

      const res = await approveAction(
        jsonRequest("http://test/api/assistant/actions/a1/approve", {}),
        routeContext({ id: "a1" }),
      );

      expect(res.status).toBe(503);
      expect(assistantService.approveAction).not.toHaveBeenCalled();
    });
  });

  describe("POST /sessions", () => {
    it("creates a session and returns 201", async () => {
      vi.mocked(assistantService.createSession).mockResolvedValue({ id: "s1", title: "Untitled" } as never);

      const res = await createSession(
        jsonRequest("http://test/api/assistant/sessions", { title: "Q1 chase" }),
        routeContext({}),
      );
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.data).toEqual({ id: "s1", title: "Untitled" });
      expect(assistantService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1", userId: "user-1" }),
        expect.objectContaining({ title: "Q1 chase" }),
      );
    });

    it("never trusts a client-supplied organizationId in the body", async () => {
      vi.mocked(assistantService.createSession).mockResolvedValue({ id: "s1" } as never);

      await createSession(
        jsonRequest("http://test/api/assistant/sessions", { title: "x", organizationId: "attacker-org" }),
        routeContext({}),
      );

      const [ctxArg] = vi.mocked(assistantService.createSession).mock.calls[0];
      expect(ctxArg).toMatchObject({ organizationId: "org-1" });
    });
  });

  describe("GET /sessions", () => {
    it("lists sessions scoped to ctx", async () => {
      vi.mocked(assistantService.listSessions).mockResolvedValue([{ id: "s1" }] as never);

      const res = await listSessions(new Request("http://test/api/assistant/sessions"), routeContext({}));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual([{ id: "s1" }]);
    });
  });

  describe("GET /sessions/:id/messages", () => {
    it("returns persisted history", async () => {
      vi.mocked(assistantService.getHistory).mockResolvedValue([{ id: "m1", role: "USER" }] as never);

      const res = await getMessages(
        new Request("http://test/api/assistant/sessions/s1/messages"),
        routeContext({ id: "s1" }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual([{ id: "m1", role: "USER" }]);
      expect(assistantService.getHistory).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" }),
        "s1",
      );
    });
  });

  describe("POST /sessions/:id/messages", () => {
    async function* fakeTurn(): AsyncGenerator<AssistantStreamEvent> {
      yield { type: "text", delta: "Hi " };
      yield { type: "text", delta: "there" };
      yield { type: "done", usage: { inputTokens: 10, outputTokens: 5 } };
    }

    it("streams SSE events from runAssistantTurn and records token usage", async () => {
      vi.mocked(assistantService.getHistory).mockResolvedValue([]);
      vi.mocked(runAssistantTurn).mockReturnValue(fakeTurn());

      const res = await postMessage(
        jsonRequest("http://test/api/assistant/sessions/s1/messages", { text: "hello" }),
        routeContext({ id: "s1" }),
      );

      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      const text = await res.text();
      expect(text).toContain('"type":"text"');
      expect(text).toContain('"delta":"Hi "');
      expect(text).toContain('"type":"done"');
      expect(recordTokenUsage).toHaveBeenCalledWith("org-1", 15);
      expect(runAssistantTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "s1",
          userText: "hello",
          ctx: expect.objectContaining({ organizationId: "org-1" }),
        }),
      );
    });

    it("returns 429 when the per-org/user rate limit is exceeded, before calling the model", async () => {
      vi.mocked(checkAssistantRateLimit).mockResolvedValue(false);

      const res = await postMessage(
        jsonRequest("http://test/api/assistant/sessions/s1/messages", { text: "hello" }),
        routeContext({ id: "s1" }),
      );

      expect(res.status).toBe(429);
      expect(runAssistantTurn).not.toHaveBeenCalled();
    });

    it("does not leak internal error details over SSE on stream failure", async () => {
      vi.mocked(assistantService.getHistory).mockResolvedValue([]);
      vi.mocked(runAssistantTurn).mockImplementation(async function* () {
        throw new Error("secret internal stack trace with api key sk-ant-XYZ");
      });

      const res = await postMessage(
        jsonRequest("http://test/api/assistant/sessions/s1/messages", { text: "hello" }),
        routeContext({ id: "s1" }),
      );
      const text = await res.text();

      expect(text).toContain('"type":"error"');
      expect(text).not.toContain("sk-ant-XYZ");
    });
  });

  describe("POST /actions/:id/approve", () => {
    it("approves the action scoped to ctx", async () => {
      vi.mocked(assistantService.approveAction).mockResolvedValue({ id: "a1", status: "EXECUTED" } as never);

      const res = await approveAction(
        jsonRequest("http://test/api/assistant/actions/a1/approve", {}),
        routeContext({ id: "a1" }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ id: "a1", status: "EXECUTED" });
      expect(assistantService.approveAction).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" }),
        "a1",
      );
    });
  });

  describe("POST /actions/:id/reject", () => {
    it("rejects the action with feedback", async () => {
      vi.mocked(assistantService.rejectAction).mockResolvedValue({ id: "a1", status: "REJECTED" } as never);

      const res = await rejectAction(
        jsonRequest("http://test/api/assistant/actions/a1/reject", { feedback: "wrong invoice" }),
        routeContext({ id: "a1" }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ id: "a1", status: "REJECTED" });
      expect(assistantService.rejectAction).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" }),
        "a1",
        "wrong invoice",
      );
    });

    it("422s on missing feedback", async () => {
      const res = await rejectAction(
        jsonRequest("http://test/api/assistant/actions/a1/reject", {}),
        routeContext({ id: "a1" }),
      );

      expect(res.status).toBe(422);
      expect(assistantService.rejectAction).not.toHaveBeenCalled();
    });
  });
});
