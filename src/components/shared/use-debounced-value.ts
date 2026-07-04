import { useEffect, useState } from "react";

/**
 * Debounces a fast-changing value (e.g. combobox search input) so dependent
 * queries don't fire on every keystroke. No debounce utility existed
 * elsewhere in the codebase (`invoice-filters.tsx`'s party combobox fires
 * unthrottled) — this is a small, local addition for the item/party pickers
 * introduced in Task 14, which query on every keystroke otherwise.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
