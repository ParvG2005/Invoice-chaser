"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Clock, Mail, Settings2, Moon } from "lucide-react";
import { SequenceEditor } from "@/modules/reminders/components/sequence-editor";
import { ReminderQueue } from "@/modules/reminders/components/reminder-queue";
import type { ReminderSettingsDto, ReminderSequenceStepDto, QuietHoursDto } from "@/types";

const WHATSAPP_ENABLED = process.env.NEXT_PUBLIC_WHATSAPP_ENABLED === "true";

const DEFAULT_QUIET_HOURS: QuietHoursDto = { start: "21:00", end: "08:00" };

function defaultSequence(
  reminderDays: number[],
  emailTone: ReminderSettingsDto["emailTone"],
  whatsappEnabled: boolean,
): ReminderSequenceStepDto[] {
  return reminderDays.map((offsetDays) => ({
    offsetDays,
    tone: emailTone,
    channels: { email: true, whatsapp: whatsappEnabled },
  }));
}

export default function RemindersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["reminder-settings"],
    queryFn: () => apiFetch<ReminderSettingsDto>("/api/reminders/settings"),
  });

  const [reminderDays, setReminderDays] = useState("3,7,14");
  const [emailTone, setEmailTone] = useState<ReminderSettingsDto["emailTone"]>("PROFESSIONAL");
  const [autoSend, setAutoSend] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [sequence, setSequence] = useState<ReminderSequenceStepDto[]>([]);
  const [quietHours, setQuietHours] = useState<QuietHoursDto>(DEFAULT_QUIET_HOURS);

  /* eslint-disable react-hooks/set-state-in-effect -- initializing form state from a query result, not a render loop */
  useEffect(() => {
    if (data) {
      setReminderDays(data.reminderDays.join(","));
      setEmailTone(data.emailTone);
      setAutoSend(data.autoSend);
      setWhatsappEnabled(data.whatsappEnabled);
      setSequence(
        data.sequence && data.sequence.length > 0
          ? data.sequence
          : defaultSequence(data.reminderDays, data.emailTone, data.whatsappEnabled),
      );
      setQuietHours(data.quietHours ?? DEFAULT_QUIET_HOURS);
    }
  }, [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: () =>
      apiFetch<ReminderSettingsDto>("/api/reminders/settings", {
        method: "PUT",
        body: JSON.stringify({
          reminderDays: reminderDays.split(",").map((d) => parseInt(d.trim(), 10)).filter(Boolean),
          emailTone,
          autoSend,
          whatsappEnabled,
          sequence,
          quietHours,
        }),
      }),
    onSuccess: () => {
      toast.success("Reminder settings saved");
      queryClient.invalidateQueries({ queryKey: ["reminder-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerScan = useMutation({
    mutationFn: () =>
      apiFetch<{ triggered: boolean; scheduled: number }>("/api/reminders/trigger", {
        method: "POST",
      }),
    onSuccess: (result) => {
      if (result.scheduled === 0) {
        toast.info("Scan complete — no new reminders to schedule");
      } else {
        toast.success(`Scan complete — ${result.scheduled} reminder${result.scheduled !== 1 ? "s" : ""} scheduled and sending`);
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["reminders-upcoming"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const parsedDays = reminderDays
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => !isNaN(d) && d > 0)
    .sort((a, b) => a - b);

  if (isLoading) return <Skeleton className="h-64 w-full max-w-3xl" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reminders</h1>
        <p className="text-zinc-500">Manage automated follow-up sequences and track collection health.</p>
      </div>

      {/* Automation card — behaviour actually consumed by the scheduler. */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-zinc-500" />
            <CardTitle>Automation</CardTitle>
          </div>
          <CardDescription>
            When enabled, InvoicePilot automatically scans for overdue invoices every day at 9 AM and sends AI-written reminder emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="autoSend" className="text-sm font-medium">Auto-send reminders</Label>
              <p className="text-xs text-zinc-500 mt-0.5">Emails are sent automatically without manual intervention</p>
            </div>
            <Switch id="autoSend" checked={autoSend} onCheckedChange={setAutoSend} />
          </div>

          <div className="flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <div>
              <Label htmlFor="whatsappEnabled" className="text-sm font-medium">WhatsApp reminders</Label>
              <p className="text-xs text-zinc-500 mt-0.5">Send a short WhatsApp notification alongside the email</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Switch
                    id="whatsappEnabled"
                    checked={WHATSAPP_ENABLED && whatsappEnabled}
                    disabled={!WHATSAPP_ENABLED}
                    onCheckedChange={setWhatsappEnabled}
                  />
                </span>
              </TooltipTrigger>
              {!WHATSAPP_ENABLED && <TooltipContent>Available after Phase 4</TooltipContent>}
            </Tooltip>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reminderDays">Reminder schedule (days overdue)</Label>
            <Input
              id="reminderDays"
              value={reminderDays}
              onChange={(e) => setReminderDays(e.target.value)}
              placeholder="3,7,14"
            />
            {parsedDays.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {parsedDays.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    <Clock className="h-3 w-3" />
                    {d} day{d !== 1 ? "s" : ""} overdue
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Default email tone</Label>
            <Select value={emailTone} onValueChange={(v) => setEmailTone(v as typeof emailTone)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FRIENDLY">😊 Friendly — warm and understanding</SelectItem>
                <SelectItem value="PROFESSIONAL">💼 Professional — polished and clear</SelectItem>
                <SelectItem value="FIRM">⚡ Firm — urgent and direct</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sequence editor — additive config surfaced here, not yet consumed by
          the scheduler (which still reads the Automation card's fields above). */}
      <Card>
        <CardHeader>
          <CardTitle>Reminder Sequence</CardTitle>
          <CardDescription>Define the schedule and tone for automatic reminders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SequenceEditor steps={sequence} onChange={setSequence} />

          <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center gap-2">
              <Moon className="h-4 w-4 text-zinc-500" />
              <Label className="text-sm font-medium">Quiet hours</Label>
            </div>
            <div className="flex items-center gap-3">
              <Input
                type="time"
                aria-label="Quiet hours start"
                value={quietHours.start}
                onChange={(e) => setQuietHours({ ...quietHours, start: e.target.value })}
                className="w-32"
              />
              <span className="text-sm text-zinc-500">to</span>
              <Input
                type="time"
                aria-label="Quiet hours end"
                value={quietHours.end}
                onChange={(e) => setQuietHours({ ...quietHours, end: e.target.value })}
                className="w-32"
              />
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Reminders won&apos;t be sent during these hours.
            </p>
          </div>

          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : "Save sequence"}
          </Button>
        </CardContent>
      </Card>

      {/* Manual trigger card — moved here from the old Settings page. */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <CardTitle>Manual Reminder Scan</CardTitle>
          </div>
          <CardDescription>
            Run the overdue invoice scan immediately instead of waiting for the daily cron job.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 text-zinc-400 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-zinc-700 dark:text-zinc-300">How auto-reminders work</p>
                <ul className="mt-1.5 space-y-1 text-zinc-500 text-xs list-disc list-inside">
                  <li>Daily cron job runs at 9 AM and scans all invoices</li>
                  <li>Overdue invoices are matched against your reminder schedule</li>
                  <li>Groq AI writes a unique, personalised email for each invoice</li>
                  <li>Each invoice only receives one reminder per milestone (e.g. 3-day, 7-day)</li>
                </ul>
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            className="gap-2"
            disabled={triggerScan.isPending}
            onClick={() => triggerScan.mutate()}
          >
            <Zap className={`h-4 w-4 ${triggerScan.isPending ? "animate-pulse text-amber-500" : ""}`} />
            {triggerScan.isPending ? "Scanning..." : "Trigger scan now"}
          </Button>
        </CardContent>
      </Card>

      <ReminderQueue />
    </div>
  );
}
