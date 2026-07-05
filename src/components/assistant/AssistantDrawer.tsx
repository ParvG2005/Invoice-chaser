"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, Send, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api/client";
import { useAssistantStream } from "@/components/assistant/useAssistantStream";
import { MessageList } from "@/components/assistant/MessageList";
import {
  ContextChips,
  serializeContextChip,
  type AssistantContextEntity,
} from "@/components/assistant/ContextChips";
import { expandSlashShortcut, SLASH_SHORTCUTS } from "@/components/assistant/SlashShortcuts";

/**
 * Best-effort mapping from the dashboard URL to the entity currently being
 * viewed, so the assistant can auto-share "what page am I on" as a context
 * chip. Only covers the detail-page shapes that exist today
 * (`/dashboard/<resource>/<id>` and the same nested under `(shell)`).
 */
const ENTITY_KIND_BY_SEGMENT: Record<string, string> = {
  invoices: "invoice",
  parties: "party",
  bills: "bill",
  stock: "stock item",
  payments: "payment",
};

function resolveContextEntity(pathname: string): AssistantContextEntity | null {
  const segments = pathname.split("/").filter(Boolean);
  const dashboardIndex = segments.indexOf("dashboard");
  if (dashboardIndex === -1) return null;
  const [resource, id] = segments.slice(dashboardIndex + 1);
  if (!resource || !id) return null;
  const kind = ENTITY_KIND_BY_SEGMENT[resource];
  if (!kind) return null;
  return { kind, id, label: id };
}

interface AssistantSession {
  id: string;
}

export function AssistantDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [chipDismissed, setChipDismissed] = useState(false);
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, actions, isStreaming, error, sendMessage, approve, reject } =
    useAssistantStream(sessionId);

  const entity = useMemo(() => resolveContextEntity(pathname), [pathname]);

  // Reset the "user dismissed the chip" flag whenever the underlying page changes.
  useEffect(() => {
    setChipDismissed(false);
  }, [entity?.kind, entity?.id]);

  useEffect(() => {
    if (!open || sessionId || sessionError) return;
    let cancelled = false;
    apiFetch<AssistantSession>("/api/assistant/sessions", { method: "POST", body: JSON.stringify({}) })
      .then((session) => {
        if (!cancelled) setSessionId(session.id);
      })
      .catch((err) => {
        if (!cancelled) setSessionError(err instanceof Error ? err.message : "Could not start a session");
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, sessionError]);

  const shortcutSuggestions = useMemo(() => {
    if (!input.startsWith("/")) return [];
    return SLASH_SHORTCUTS.filter((s) => s.command.startsWith(input.split(" ")[0]));
  }, [input]);

  const handleApprove = useCallback(
    async (actionId: string) => {
      setPendingActionIds((prev) => new Set(prev).add(actionId));
      try {
        await approve(actionId);
      } finally {
        setPendingActionIds((prev) => {
          const next = new Set(prev);
          next.delete(actionId);
          return next;
        });
      }
    },
    [approve],
  );

  const handleReject = useCallback(
    async (actionId: string, feedback: string) => {
      setPendingActionIds((prev) => new Set(prev).add(actionId));
      try {
        await reject(actionId, feedback);
      } finally {
        setPendingActionIds((prev) => {
          const next = new Set(prev);
          next.delete(actionId);
          return next;
        });
      }
    },
    [reject],
  );

  const handleSubmit = useCallback(() => {
    const raw = input.trim();
    if (!raw || isStreaming) return;
    const expanded = expandSlashShortcut(raw);
    const contextChip = entity && !chipDismissed ? serializeContextChip(entity) : undefined;
    setInput("");
    void sendMessage(expanded, contextChip);
  }, [input, isStreaming, entity, chipDismissed, sendMessage]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="icon"
          aria-label="Open AI assistant"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg"
        >
          <Sparkles className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b border-zinc-200 dark:border-zinc-800">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Assistant
          </SheetTitle>
          <SheetDescription>
            Ask about invoices, parties, or stock. Actions that change data always need your approval.
          </SheetDescription>
        </SheetHeader>

        {sessionError ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
            {sessionError}
          </div>
        ) : (
          <MessageList
            messages={messages}
            actions={actions}
            isStreaming={isStreaming}
            onApprove={handleApprove}
            onReject={handleReject}
            pendingActionIds={pendingActionIds}
          />
        )}

        {error && <p className="px-4 text-xs text-destructive">{error}</p>}

        <SheetFooter className="gap-2 border-t border-zinc-200 dark:border-zinc-800">
          <ContextChips
            entity={entity}
            dismissed={chipDismissed}
            onDismiss={() => setChipDismissed(true)}
            onRestore={() => setChipDismissed(false)}
          />

          {shortcutSuggestions.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-white p-1 text-xs dark:border-zinc-800 dark:bg-zinc-950">
              {shortcutSuggestions.map((s) => (
                <button
                  key={s.command}
                  type="button"
                  className="rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => {
                    setInput(`${s.command} `);
                    textareaRef.current?.focus();
                  }}
                >
                  <span className="font-mono font-medium">{s.command}</span>{" "}
                  <span className="text-zinc-500 dark:text-zinc-400">{s.description}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Ask InvoicePilot, or type / for shortcuts…"
              className="min-h-[44px] flex-1 resize-none"
              disabled={!sessionId || Boolean(sessionError)}
            />
            <Button
              type="button"
              size="icon"
              onClick={handleSubmit}
              disabled={!sessionId || isStreaming || input.trim().length === 0}
              aria-label="Send message"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
