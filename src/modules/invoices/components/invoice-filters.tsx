"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChipStatus } from "@/components/shared/status-chip";
import { useInvoiceFilters } from "@/store/invoice-filters";
import type { PartyDto } from "@/types";

const STATUS_OPTIONS: { value: ChipStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIALLY_PAID", label: "Partially paid" },
  { value: "WRITTEN_OFF", label: "Written off" },
];

export function InvoiceFiltersBar() {
  const { filters, savedFilters, setFilters, saveCurrent, applySaved } = useInvoiceFilters();
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyQuery, setPartyQuery] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);

  const { data: parties } = useQuery({
    queryKey: ["parties", partyQuery],
    queryFn: () =>
      apiFetch<PartyDto[]>(`/api/parties?query=${encodeURIComponent(partyQuery)}&limit=20`),
    enabled: partyOpen,
  });

  const activeStatus = filters.status?.[0];
  const selectedParty = parties?.find((p) => p.id === filters.partyId);

  function toggleStatus(status: ChipStatus) {
    setFilters({
      ...filters,
      status: activeStatus === status ? undefined : [status],
    });
  }

  function handleSave() {
    if (!filterName.trim()) return;
    saveCurrent(filterName.trim());
    setActiveTab(filterName.trim());
    setFilterName("");
    setSaveOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={activeStatus === option.value ? "default" : "outline"}
            aria-pressed={activeStatus === option.value}
            onClick={() => toggleStatus(option.value)}
          >
            {option.label}
          </Button>
        ))}

        <Popover open={partyOpen} onOpenChange={setPartyOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              {selectedParty ? selectedParty.name : "Party"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search parties…"
                value={partyQuery}
                onValueChange={setPartyQuery}
              />
              <CommandList>
                <CommandEmpty>No parties found.</CommandEmpty>
                <CommandGroup>
                  {(parties ?? []).map((party) => (
                    <CommandItem
                      key={party.id}
                      value={party.id}
                      onSelect={() => {
                        setFilters({ ...filters, partyId: party.id });
                        setPartyOpen(false);
                      }}
                    >
                      {party.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {filters.dueAfter || filters.dueBefore
                ? `${filters.dueAfter ? format(new Date(filters.dueAfter), "MMM d") : "…"} – ${
                    filters.dueBefore ? format(new Date(filters.dueBefore), "MMM d") : "…"
                  }`
                : "Due date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="range"
              selected={{
                from: filters.dueAfter ? new Date(filters.dueAfter) : undefined,
                to: filters.dueBefore ? new Date(filters.dueBefore) : undefined,
              }}
              onSelect={(range) =>
                setFilters({
                  ...filters,
                  dueAfter: range?.from ? range.from.toISOString() : undefined,
                  dueBefore: range?.to ? range.to.toISOString() : undefined,
                })
              }
            />
          </PopoverContent>
        </Popover>

        <Input
          placeholder="Search invoices…"
          className="h-9 w-48"
          value={filters.search ?? ""}
          onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
        />

        {(filters.status?.length || filters.partyId || filters.dueBefore || filters.dueAfter || filters.search) && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setFilters({})}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}

        <Button type="button" size="sm" variant="outline" onClick={() => setSaveOpen(true)}>
          Save filter
        </Button>
      </div>

      {savedFilters.length > 0 && (
        <Tabs
          value={activeTab}
          onValueChange={(name) => {
            setActiveTab(name);
            applySaved(name);
          }}
        >
          <TabsList>
            {savedFilters.map((saved) => (
              <TabsTrigger key={saved.name} value={saved.name}>
                {saved.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className={cn("sm:max-w-sm")}>
          <DialogHeader>
            <DialogTitle>Save filter</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="filter-name">Filter name</Label>
            <Input
              id="filter-name"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
