"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createPartySchema, updatePartySchema } from "@/lib/validations/party";
import type { PartyDto, PartyType } from "@/types";

const PARTY_TYPES: { value: PartyType; label: string }[] = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "SUPPLIER", label: "Supplier" },
  { value: "AGENT", label: "Agent" },
  { value: "BOTH", label: "Customer & Supplier" },
];

interface FormState {
  type: PartyType;
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  gstin: string;
  billingAddress: string;
  creditLimit: string;
  creditDays: string;
  agentId: string;
}

const EMPTY_FORM: FormState = {
  type: "CUSTOMER",
  name: "",
  email: "",
  phone: "",
  whatsapp: "",
  gstin: "",
  billingAddress: "",
  creditLimit: "",
  creditDays: "",
  agentId: "",
};

function toFormState(party: PartyDto): FormState {
  return {
    type: party.type,
    name: party.name,
    email: party.email ?? "",
    phone: party.phone ?? "",
    whatsapp: party.whatsapp ?? "",
    gstin: party.gstin ?? "",
    billingAddress: party.billingAddress ?? "",
    creditLimit: party.creditLimit != null ? String(party.creditLimit) : "",
    creditDays: party.creditDays != null ? String(party.creditDays) : "",
    agentId: party.agentId ?? "",
  };
}

/** Undefined-ifies blank strings so optional zod string fields don't fail `.email()`/length checks on "". */
function toPayload(form: FormState) {
  return {
    type: form.type,
    name: form.name.trim(),
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    whatsapp: form.whatsapp.trim() || undefined,
    gstin: form.gstin.trim() || undefined,
    billingAddress: form.billingAddress.trim() || undefined,
    creditLimit: form.creditLimit.trim() ? Number(form.creditLimit) : undefined,
    creditDays: form.creditDays.trim() ? Number(form.creditDays) : undefined,
    agentId: form.agentId || undefined,
  };
}

/**
 * Create/edit dialog for a party. Zod-validated against the existing
 * `createPartySchema`/`updatePartySchema` (`src/lib/validations/party.ts`)
 * rather than a re-declared schema, so the client and server never drift.
 */
export function PartyFormDialog({
  party,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  /** Present => edit mode; absent => create mode. */
  party?: PartyDto;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const [form, setForm] = useState<FormState>(party ? toFormState(party) : EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset the form whenever the dialog transitions to open — adjusting
  // state during render (rather than in a `useEffect`) per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(party ? toFormState(party) : EMPTY_FORM);
      setErrors({});
    }
  }

  // Agent picker options — only AGENT/BOTH parties can be assigned as a customer's agent.
  const { data: agentOptions } = useQuery({
    queryKey: ["parties", "agents-for-picker"],
    queryFn: () => apiFetch<PartyDto[]>("/api/parties?type=AGENT&limit=100"),
    enabled: open,
  });

  const isEdit = !!party;

  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof toPayload>) =>
      isEdit
        ? apiFetch<PartyDto>(`/api/parties/${party!.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : apiFetch<PartyDto>("/api/parties", {
            method: "POST",
            body: JSON.stringify(payload),
          }),
    onSuccess: () => {
      toast.success(isEdit ? "Party updated" : "Party created");
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ["party", party!.id] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit() {
    const payload = toPayload(form);
    const schema = isEdit ? updatePartySchema : createPartySchema;
    const result = schema.safeParse(payload);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    mutation.mutate(payload);
  }

  const showAgentPicker = form.type === "CUSTOMER" || form.type === "BOTH";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined ? (
        trigger
      ) : !isEdit ? (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New party
        </Button>
      ) : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit party" : "New party"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="party-name">Name</Label>
              <Input
                id="party-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(value) => setForm({ ...form, type: value as PartyType })}
              >
                <SelectTrigger id="party-type" aria-label="Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="party-email">Email</Label>
              <Input
                id="party-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-phone">Phone</Label>
              <Input
                id="party-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="party-whatsapp">WhatsApp</Label>
              <Input
                id="party-whatsapp"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-gstin">GSTIN</Label>
              <Input
                id="party-gstin"
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="party-address">Billing address</Label>
            <Textarea
              id="party-address"
              value={form.billingAddress}
              onChange={(e) => setForm({ ...form, billingAddress: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="party-credit-limit">Credit limit</Label>
              <Input
                id="party-credit-limit"
                type="number"
                min={0}
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-credit-days">Credit days</Label>
              <Input
                id="party-credit-days"
                type="number"
                min={0}
                value={form.creditDays}
                onChange={(e) => setForm({ ...form, creditDays: e.target.value })}
              />
            </div>
          </div>

          {showAgentPicker && (
            <div className="grid gap-2">
              <Label htmlFor="party-agent">Agent</Label>
              <Select
                value={form.agentId || "__none__"}
                onValueChange={(value) =>
                  setForm({ ...form, agentId: value === "__none__" ? "" : value })
                }
              >
                <SelectTrigger id="party-agent">
                  <SelectValue placeholder="No agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No agent</SelectItem>
                  {(agentOptions ?? [])
                    .filter((a) => a.id !== party?.id)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!form.name.trim() || mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create party"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
