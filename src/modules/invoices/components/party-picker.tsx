"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { useDebouncedValue } from "@/components/shared/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PartyDto } from "@/types";

export interface PartyPickerValue {
  id: string;
  name: string;
  email: string | null;
}

interface PartyPickerProps {
  value: PartyPickerValue | null;
  onChange: (party: PartyPickerValue) => void;
}

/** Command-in-Popover combobox for selecting (or creating) the invoice's party. */
export function PartyPicker({ value, onChange }: PartyPickerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", phone: "" });

  const { data: parties, isFetching } = useQuery({
    queryKey: ["parties", debouncedQuery],
    queryFn: () =>
      apiFetch<PartyDto[]>(`/api/parties?query=${encodeURIComponent(debouncedQuery)}&limit=20`),
    enabled: open,
  });

  const createParty = useMutation({
    mutationFn: () =>
      apiFetch<PartyDto>("/api/parties", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email || undefined,
          phone: createForm.phone || undefined,
        }),
      }),
    onSuccess: (party) => {
      toast.success("Party created");
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      onChange({ id: party.id, name: party.name, email: party.email });
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", phone: "" });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start font-normal">
            {value ? value.name : "Select party…"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search parties…" value={query} onValueChange={setQuery} />
            <CommandList>
              {!isFetching && <CommandEmpty>No parties found.</CommandEmpty>}
              <CommandGroup>
                {(parties ?? []).map((party) => (
                  <CommandItem
                    key={party.id}
                    value={party.id}
                    onSelect={() => {
                      onChange({ id: party.id, name: party.name, email: party.email });
                      setOpen(false);
                    }}
                  >
                    {party.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              {query.trim() && (
                <div className="border-t p-1">
                  <CommandItem
                    value={`__create__${query}`}
                    onSelect={() => {
                      setCreateForm((f) => ({ ...f, name: query }));
                      setCreateOpen(true);
                    }}
                  >
                    Create &ldquo;{query}&rdquo;
                  </CommandItem>
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create party</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="party-name">Name</Label>
              <Input
                id="party-name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-email">Email</Label>
              <Input
                id="party-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-phone">Phone</Label>
              <Input
                id="party-phone"
                type="tel"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!createForm.name.trim() || createParty.isPending}
              onClick={() => createParty.mutate()}
            >
              {createParty.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
