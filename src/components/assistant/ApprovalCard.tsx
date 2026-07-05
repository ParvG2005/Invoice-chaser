"use client";

import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import type { AssistantProposedAction } from "@/components/assistant/useAssistantStream";

const STATUS_BADGE: Record<AssistantProposedAction["status"], { label: string; variant: "default" | "secondary" | "success" | "warning" | "danger" }> = {
  PROPOSED: { label: "Awaiting approval", variant: "warning" },
  APPROVED: { label: "Approving…", variant: "secondary" },
  EXECUTED: { label: "Executed", variant: "success" },
  REJECTED: { label: "Rejected", variant: "secondary" },
  FAILED: { label: "Failed", variant: "danger" },
};

interface ApprovalCardProps {
  action: AssistantProposedAction;
  onApprove: (actionId: string) => void | Promise<void>;
  onReject: (actionId: string, feedback: string) => void | Promise<void>;
  busy?: boolean;
}

export function ApprovalCard({ action, onApprove, onReject, busy }: ApprovalCardProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const resolved = action.status !== "PROPOSED";
  const badge = STATUS_BADGE[action.status];

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
      data-action-id={action.id}
      data-status={action.status}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-zinc-900 dark:text-zinc-50">{action.diffSummary}</p>
        <Badge variant={badge.variant} className="shrink-0">
          {badge.label}
        </Badge>
      </div>

      {action.toolName && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Tool: <code className="font-mono">{action.toolName}</code>
        </p>
      )}

      {action.status === "FAILED" && action.errorMessage && (
        <p className="text-xs text-destructive">{action.errorMessage}</p>
      )}

      {!resolved && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => onApprove(action.id)}
              disabled={busy}
              className={cn("gap-1.5")}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setShowFeedback((v) => !v)}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>

          {showFeedback && (
            <div className="flex flex-col gap-2">
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Why are you rejecting this? (helps the assistant improve)"
                className="min-h-[60px] text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy || feedback.trim().length === 0}
                onClick={() => onReject(action.id, feedback.trim())}
              >
                Confirm reject
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ApprovalCardListProps {
  actions: AssistantProposedAction[];
  onApprove: (actionId: string) => void | Promise<void>;
  onReject: (actionId: string, feedback: string) => void | Promise<void>;
  pendingIds?: Set<string>;
}

export function ApprovalCardList({ actions, onApprove, onReject, pendingIds }: ApprovalCardListProps) {
  const pending = actions.filter((a) => a.status === "PROPOSED");

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {pending.length > 1 && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => pending.forEach((a) => onApprove(a.id))}
        >
          Approve all {pending.length}
        </Button>
      )}
      {actions.map((action) => (
        <ApprovalCard
          key={action.id}
          action={action}
          onApprove={onApprove}
          onReject={onReject}
          busy={pendingIds?.has(action.id)}
        />
      ))}
    </div>
  );
}
