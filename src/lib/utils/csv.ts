import Papa from "papaparse";

/**
 * Serializes rows to CSV and triggers a browser download. Reused by
 * Invoices/Bills/Parties/Stock exports (Task 12+).
 */
export function exportCsv(rows: Record<string, unknown>[], filename: string) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
