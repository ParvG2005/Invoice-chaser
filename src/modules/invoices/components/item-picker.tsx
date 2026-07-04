"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { useDebouncedValue } from "@/components/shared/use-debounced-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { ItemSearchResultDto } from "@/types";

interface ItemPickerProps {
  label: string;
  onSelect: (item: ItemSearchResultDto) => void;
}

/** Command-in-Popover combobox for picking a catalog item onto a line-items row. */
export function ItemPicker({ label, onSelect }: ItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);

  const { data: items, isFetching } = useQuery({
    queryKey: ["items", debouncedQuery],
    queryFn: () =>
      apiFetch<ItemSearchResultDto[]>(`/api/items?query=${encodeURIComponent(debouncedQuery)}&limit=20`),
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full justify-start font-normal">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search items…" value={query} onValueChange={setQuery} />
          <CommandList>
            {!isFetching && <CommandEmpty>No items found.</CommandEmpty>}
            <CommandGroup>
              {(items ?? []).map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between gap-2"
                >
                  <span>{item.name}</span>
                  <Badge variant="secondary">{item.stockOnHand}</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
