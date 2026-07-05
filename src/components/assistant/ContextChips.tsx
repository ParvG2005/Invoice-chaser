"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface AssistantContextEntity {
  kind: string;
  id: string;
  label: string;
}

/** Serializes a page-entity context so the assistant auto-receives "what page am I on". */
export function serializeContextChip(entity: AssistantContextEntity): string {
  return `Context: viewing ${entity.kind} ${entity.label} (id ${entity.id})`;
}

interface ContextChipsProps {
  entity: AssistantContextEntity | null;
  dismissed: boolean;
  onDismiss: () => void;
  onRestore: () => void;
}

export function ContextChips({ entity, dismissed, onDismiss, onRestore }: ContextChipsProps) {
  if (!entity) return null;

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={onRestore}
        className="self-start text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
      >
        Share current page context
      </button>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
      )}
    >
      <span className="truncate">
        Viewing {entity.kind} <span className="font-medium">{entity.label}</span>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Remove context"
        className="shrink-0 rounded-full p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
