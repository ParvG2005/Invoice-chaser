"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";

export interface AssistantChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export type AssistantActionStatus = "PROPOSED" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";

export interface AssistantProposedAction {
  id: string;
  toolName?: string;
  status: AssistantActionStatus;
  diffSummary: string;
  errorMessage?: string | null;
}

type AssistantSSEEvent =
  | { type: "text"; delta: string }
  | { type: "proposed_action"; action: AssistantProposedAction }
  | { type: "tool_result"; toolName: string; ok: boolean }
  | { type: "done"; usage: { inputTokens: number; outputTokens: number } }
  | { type: "error"; message: string };

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export interface UseAssistantStreamResult {
  messages: AssistantChatMessage[];
  actions: AssistantProposedAction[];
  isStreaming: boolean;
  error: string | null;
  sendMessage: (text: string, contextChip?: string) => Promise<void>;
  approve: (actionId: string) => Promise<void>;
  reject: (actionId: string, feedback: string) => Promise<void>;
}

/**
 * Streams a turn of the assistant conversation for `sessionId` by POSTing to
 * the messages route and reading the response body as a `data: <json>\n\n`
 * SSE stream (fetch + ReadableStream, not EventSource, since the request is
 * a POST with a body — see Task 6's client.ts for the event shapes).
 */
export function useAssistantStream(sessionId: string | null): UseAssistantStreamResult {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [actions, setActions] = useState<AssistantProposedAction[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (text: string, contextChip?: string) => {
      const trimmed = text.trim();
      if (!sessionId || !trimmed || isStreaming) return;

      setError(null);
      setMessages((prev) => [...prev, { id: nextId("user"), role: "user", text: trimmed }]);

      const assistantId = nextId("assistant");
      streamingIdRef.current = assistantId;
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "" }]);
      setIsStreaming(true);

      try {
        const response = await fetch(`/api/assistant/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, contextChip }),
        });

        if (!response.ok || !response.body) {
          throw new Error("Failed to reach the assistant");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line) continue;
            const payload = line.startsWith("data:") ? line.slice("data:".length).trim() : line;
            if (!payload) continue;

            let event: AssistantSSEEvent;
            try {
              event = JSON.parse(payload) as AssistantSSEEvent;
            } catch {
              continue;
            }

            if (event.type === "text") {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + event.delta } : m)),
              );
            } else if (event.type === "proposed_action") {
              setActions((prev) => [...prev, event.action]);
            } else if (event.type === "error") {
              setError(event.message);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "The assistant encountered an error.");
      } finally {
        setIsStreaming(false);
        streamingIdRef.current = null;
      }
    },
    [sessionId, isStreaming],
  );

  const approve = useCallback(async (actionId: string) => {
    try {
      const updated = await apiFetch<AssistantProposedAction>(
        `/api/assistant/actions/${actionId}/approve`,
        { method: "POST" },
      );
      setActions((prev) => prev.map((a) => (a.id === actionId ? { ...a, ...updated } : a)));
    } catch (err) {
      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId
            ? {
                ...a,
                status: "FAILED",
                errorMessage: err instanceof Error ? err.message : "Approval failed",
              }
            : a,
        ),
      );
    }
  }, []);

  const reject = useCallback(async (actionId: string, feedback: string) => {
    try {
      const updated = await apiFetch<AssistantProposedAction>(
        `/api/assistant/actions/${actionId}/reject`,
        { method: "POST", body: JSON.stringify({ feedback }) },
      );
      setActions((prev) => prev.map((a) => (a.id === actionId ? { ...a, ...updated } : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject the action.");
    }
  }, []);

  return { messages, actions, isStreaming, error, sendMessage, approve, reject };
}
