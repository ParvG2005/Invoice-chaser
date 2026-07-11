"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { AssistantChatMessage, AssistantProposedAction } from "@/components/assistant/useAssistantStream";
import { ApprovalCardList } from "@/components/assistant/ApprovalCard";
import { FormattedMessage } from "@/components/assistant/FormattedMessage";

/** "search_invoices" → "search invoices" — a readable label for the activity chip. */
function humanizeTool(name: string): string {
  return name.replace(/_/g, " ");
}

interface MessageListProps {
  messages: AssistantChatMessage[];
  actions: AssistantProposedAction[];
  isStreaming: boolean;
  onApprove: (actionId: string) => void | Promise<void>;
  onReject: (actionId: string, feedback: string) => void | Promise<void>;
  pendingActionIds?: Set<string>;
}

export function MessageList({
  messages,
  actions,
  isStreaming,
  onApprove,
  onReject,
  pendingActionIds,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, actions]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">Ask InvoicePilot anything</p>
        <p>Try “/aging” or “which invoices should I chase today?”</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {messages.map((message, index) => {
        const isLastAssistant =
          message.role === "assistant" && index === messages.length - 1 && isStreaming;
        return (
          <div
            key={message.id}
            className={cn(
              "flex flex-col gap-1",
              message.role === "user" ? "items-end" : "items-start",
            )}
          >
            {message.role === "assistant" && message.tools && message.tools.length > 0 && (
              <div className="flex max-w-[85%] flex-wrap gap-1.5 px-1">
                {message.tools.map((tool, i) => (
                  <span
                    key={i}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                      tool.ok
                        ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
                    )}
                  >
                    <Search className="h-3 w-3" />
                    {humanizeTool(tool.name)}
                  </span>
                ))}
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                message.role === "user"
                  ? "whitespace-pre-wrap bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50",
              )}
            >
              {message.role === "assistant" ? (
                message.text ? (
                  <FormattedMessage text={message.text} />
                ) : isLastAssistant ? (
                  <span className="animate-pulse">…</span>
                ) : (
                  ""
                )
              ) : (
                message.text
              )}
            </div>
          </div>
        );
      })}

      {actions.length > 0 && (
        <ApprovalCardList
          actions={actions}
          onApprove={onApprove}
          onReject={onReject}
          pendingIds={pendingActionIds}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}
