"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReminderSequenceStepDto } from "@/types";

// Same env-flag pattern as `invoice-row-actions.tsx` (Task 12): unset/anything
// other than "true" means WhatsApp isn't live yet, so its toggle stays disabled
// with a tooltip rather than silently doing nothing when clicked.
const WHATSAPP_ENABLED = process.env.NEXT_PUBLIC_WHATSAPP_ENABLED === "true";

const TONE_OPTIONS: { value: ReminderSequenceStepDto["tone"]; label: string }[] = [
  { value: "FRIENDLY", label: "Friendly" },
  { value: "PROFESSIONAL", label: "Professional" },
  { value: "FIRM", label: "Firm" },
  { value: "FINAL_NOTICE", label: "Final notice" },
];

export function SequenceEditor({
  steps,
  onChange,
}: {
  steps: ReminderSequenceStepDto[];
  onChange: (steps: ReminderSequenceStepDto[]) => void;
}) {
  function updateStep(index: number, patch: Partial<ReminderSequenceStepDto>) {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }

  function addStep() {
    const lastOffset = steps.at(-1)?.offsetDays ?? 0;
    onChange([
      ...steps,
      {
        offsetDays: lastOffset + 7,
        tone: "PROFESSIONAL",
        channels: { email: true, whatsapp: false },
      },
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3" data-testid="sequence-steps">
        {steps.map((step, index) => (
          <div
            key={index}
            data-testid="sequence-step-row"
            className="grid grid-cols-1 items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 sm:grid-cols-[1fr_1.5fr_auto_auto_auto]"
          >
            <div className="grid gap-1.5">
              <Label htmlFor={`step-offset-${index}`}>Offset (days overdue)</Label>
              <Input
                id={`step-offset-${index}`}
                type="number"
                min={0}
                max={90}
                value={step.offsetDays}
                onChange={(e) =>
                  updateStep(index, { offsetDays: parseInt(e.target.value, 10) || 0 })
                }
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Tone</Label>
              <Select
                value={step.tone}
                onValueChange={(v) => updateStep(index, { tone: v as ReminderSequenceStepDto["tone"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id={`step-email-${index}`}
                checked={step.channels.email}
                onCheckedChange={(checked) =>
                  updateStep(index, { channels: { ...step.channels, email: checked } })
                }
              />
              <Label htmlFor={`step-email-${index}`} className="text-xs">Email</Label>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-2">
                    <Switch
                      id={`step-whatsapp-${index}`}
                      checked={WHATSAPP_ENABLED && step.channels.whatsapp}
                      disabled={!WHATSAPP_ENABLED}
                      onCheckedChange={(checked) =>
                        updateStep(index, { channels: { ...step.channels, whatsapp: checked } })
                      }
                    />
                    <Label htmlFor={`step-whatsapp-${index}`} className="text-xs">WhatsApp</Label>
                  </span>
                </TooltipTrigger>
                {!WHATSAPP_ENABLED && <TooltipContent>Available after Phase 4</TooltipContent>}
              </Tooltip>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove step"
              onClick={() => removeStep(index)}
            >
              <Trash2 className="h-4 w-4 text-zinc-400" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" className="gap-2" onClick={addStep}>
        <Plus className="h-4 w-4" />
        Add step
      </Button>
    </div>
  );
}
