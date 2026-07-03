import Papa from "papaparse";
import { csvInvoiceRowSchema, type CreateInvoiceInput } from "@/lib/validations/invoice";
import { ZodError } from "zod";

export interface CsvParseResult {
  invoices: CreateInvoiceInput[];
  errors: string[];
}

/**
 * Enhanced CSV parser that handles many column name variations including:
 *  - Standard (clientName, clientEmail, amount, dueDate, invoiceNumber)
 *  - Snake case (client_name, client_email, etc.)
 *  - Title case (ClientName, ClientEmail, etc.)
 *  - Tally CSV exports (Party Name, Amount, Date, etc.)
 *  - QuickBooks exports
 */
const FIELD_ALIASES: Record<string, string[]> = {
  clientName: ["clientName", "client_name", "ClientName", "Party Name", "Customer", "Customer Name", "Bill To", "Name"],
  clientEmail: ["clientEmail", "client_email", "ClientEmail", "Email", "email", "Customer Email", "Contact Email"],
  clientPhone: ["clientPhone", "client_phone", "ClientPhone", "Phone", "phone", "Customer Phone", "Contact Phone", "Mobile", "Mobile Number", "whatsapp", "WhatsApp"],
  amount: ["amount", "Amount", "Total", "total", "Grand Total", "Invoice Amount", "Balance Due", "Net Amount", "AMOUNT"],
  dueDate: ["dueDate", "due_date", "DueDate", "Due Date", "Due", "Payment Due", "Bill Date", "DATE", "Date"],
  invoiceNumber: ["invoiceNumber", "invoice_number", "InvoiceNumber", "Invoice #", "Invoice Number", "Invoice No", "VOUCHERNUMBER", "Voucher No", "Ref No"],
  notes: ["notes", "Notes", "Description", "Narration", "NARRATION", "Memo", "Comments", "Remarks"],
};

function resolveField(row: Record<string, string>, fieldKey: string): string | undefined {
  const aliases = FIELD_ALIASES[fieldKey] ?? [fieldKey];
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== "") return row[alias];
  }
  return undefined;
}

export function parseCsv(file: File): Promise<CsvParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const invoices: CreateInvoiceInput[] = [];
        const errors: string[] = [];

        results.data.forEach((row, index) => {
          try {
            const normalized = {
              clientName: resolveField(row, "clientName"),
              clientEmail: resolveField(row, "clientEmail"),
              clientPhone: resolveField(row, "clientPhone"),
              amount: resolveField(row, "amount"),
              dueDate: resolveField(row, "dueDate"),
              invoiceNumber: resolveField(row, "invoiceNumber"),
              notes: resolveField(row, "notes"),
            };
            const parsed = csvInvoiceRowSchema.parse(normalized);
            invoices.push({
              ...parsed,
              dueDate: parsed.dueDate,
            } as CreateInvoiceInput);
          } catch (err) {
            const rowId = resolveField(row, "invoiceNumber") ?? `Row ${index + 2}`;
            const msg = err instanceof ZodError ? err.errors[0]?.message : String(err);
            errors.push(`${rowId}: ${msg}`);
          }
        });

        resolve({ invoices, errors });
      },
      error: () => resolve({ invoices: [], errors: ["Failed to parse CSV file."] }),
    });
  });
}
