"use client";

import { InvoiceForm } from "@/modules/invoices/components/invoice-form";

export default function NewInvoicePage() {
  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New invoice</h1>
        <p className="text-zinc-500">Pick a party, add line items, and save.</p>
      </div>
      <InvoiceForm mode="create" />
    </div>
  );
}
