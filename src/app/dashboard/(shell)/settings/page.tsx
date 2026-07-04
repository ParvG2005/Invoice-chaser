"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Building2, Mail, MessageCircle, Palette, ShieldAlert } from "lucide-react";
import type { OrganizationSettingsDto } from "@/types";

// Same env-flag pattern as the Reminders page / invoice-row-actions.tsx: unset
// means WhatsApp isn't live yet, so the status card just reflects that.
const WHATSAPP_ENABLED = process.env.NEXT_PUBLIC_WHATSAPP_ENABLED === "true";

type FormState = Omit<OrganizationSettingsDto, "name"> & { name: string };

const EMPTY: FormState = {
  name: "",
  gstin: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  logoUrl: "",
  senderName: "",
  senderReplyTo: "",
  emailSignature: "",
  theme: "system",
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["organization-settings"],
    queryFn: () => apiFetch<OrganizationSettingsDto>("/api/organizations/settings"),
  });

  const [form, setForm] = useState<FormState>(EMPTY);

  /* eslint-disable react-hooks/set-state-in-effect -- initializing form state from a query result, not a render loop */
  useEffect(() => {
    if (data) {
      setForm({
        name: data.name,
        gstin: data.gstin ?? "",
        addressLine1: data.addressLine1 ?? "",
        addressLine2: data.addressLine2 ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        postalCode: data.postalCode ?? "",
        logoUrl: data.logoUrl ?? "",
        senderName: data.senderName ?? "",
        senderReplyTo: data.senderReplyTo ?? "",
        emailSignature: data.emailSignature ?? "",
        theme: data.theme,
      });
    }
  }, [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: () =>
      apiFetch<OrganizationSettingsDto>("/api/organizations/settings", {
        method: "PUT",
        body: JSON.stringify(form),
      }),
    onSuccess: (result) => {
      toast.success("Settings saved");
      setTheme(result.theme);
      queryClient.invalidateQueries({ queryKey: ["organization-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteOrg = useMutation({
    mutationFn: () => apiFetch("/api/organizations/settings", { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Organization deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (isLoading) return <Skeleton className="h-64 w-full max-w-2xl" />;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-zinc-500">Organization profile, sender identity, and appearance.</p>
        </div>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-zinc-500" />
            <CardTitle>Organization</CardTitle>
          </div>
          <CardDescription>Your business profile as it appears on invoices and emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input id="org-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="org-gstin">GSTIN / Tax ID</Label>
            <Input id="org-gstin" value={form.gstin ?? ""} onChange={(e) => set("gstin", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="org-address1">Address line 1</Label>
              <Input id="org-address1" value={form.addressLine1 ?? ""} onChange={(e) => set("addressLine1", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-address2">Address line 2</Label>
              <Input id="org-address2" value={form.addressLine2 ?? ""} onChange={(e) => set("addressLine2", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-city">City</Label>
              <Input id="org-city" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-state">State</Label>
              <Input id="org-state" value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-postal">Postal code</Label>
              <Input id="org-postal" value={form.postalCode ?? ""} onChange={(e) => set("postalCode", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-logo">Logo URL</Label>
              <Input id="org-logo" value={form.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-zinc-500" />
            <CardTitle>Sender identity</CardTitle>
          </div>
          <CardDescription>How reminder emails identify who they&apos;re from.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="sender-name">Sender name</Label>
            <Input id="sender-name" value={form.senderName ?? ""} onChange={(e) => set("senderName", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sender-reply-to">Reply-to email</Label>
            <Input id="sender-reply-to" value={form.senderReplyTo ?? ""} onChange={(e) => set("senderReplyTo", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sender-signature">Email signature</Label>
            <Textarea
              id="sender-signature"
              rows={3}
              value={form.emailSignature ?? ""}
              onChange={(e) => set("emailSignature", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-zinc-500" />
            <CardTitle>WhatsApp</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {WHATSAPP_ENABLED ? "Connected" : "Connects in Phase 4"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Automated direct messaging and payment links via WhatsApp Business.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-zinc-500" />
            <CardTitle>Appearance</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Label htmlFor="org-theme">Theme</Label>
            <Select value={form.theme} onValueChange={(v) => set("theme", v as FormState["theme"])}>
              <SelectTrigger id="org-theme" aria-label="Theme" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <CardTitle className="text-red-600 dark:text-red-400">Danger zone</CardTitle>
          </div>
          <CardDescription>
            Deleting your organization removes access for all members. This can be undone by contacting support.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete organization
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this organization?"
        description={`"${form.name}" and all members will lose access. This action is not easily reversible.`}
        confirmLabel="Delete organization"
        destructive
        onConfirm={() => deleteOrg.mutate()}
      />
    </div>
  );
}
