import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface InvoiceFilters {
  status?: string[];
  partyId?: string;
  dueBefore?: string;
  dueAfter?: string;
  search?: string;
}

export interface SavedInvoiceFilter {
  name: string;
  filters: InvoiceFilters;
}

interface InvoiceFiltersState {
  filters: InvoiceFilters;
  savedFilters: SavedInvoiceFilter[];
  setFilters: (filters: InvoiceFilters) => void;
  saveCurrent: (name: string) => void;
  applySaved: (name: string) => void;
  deleteSaved: (name: string) => void;
}

export const useInvoiceFilters = create<InvoiceFiltersState>()(
  persist(
    (set, get) => ({
      filters: {},
      savedFilters: [],
      setFilters: (filters) => set({ filters }),
      saveCurrent: (name) =>
        set((state) => ({
          savedFilters: [
            ...state.savedFilters.filter((saved) => saved.name !== name),
            { name, filters: state.filters },
          ],
        })),
      applySaved: (name) => {
        const saved = get().savedFilters.find((s) => s.name === name);
        if (saved) set({ filters: saved.filters });
      },
      deleteSaved: (name) =>
        set((state) => ({
          savedFilters: state.savedFilters.filter((saved) => saved.name !== name),
        })),
    }),
    { name: "invoicepilot.saved-filters" },
  ),
);
