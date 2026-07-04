import type { Invoice, Party } from "@/generated/prisma/client";
import type { InvoiceDto, PartyDto } from "@/types";
import { decimalToNumber } from "@/lib/utils/currency";

export function toInvoiceDto(invoice: Invoice): InvoiceDto {
  return {
    id: invoice.id,
    clientName: invoice.clientName,
    clientEmail: invoice.clientEmail,
    clientPhone: invoice.clientPhone,
    amount: decimalToNumber(invoice.amount),
    dueDate: invoice.dueDate.toISOString(),
    invoiceNumber: invoice.invoiceNumber,
    notes: invoice.notes,
    status: invoice.status,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

export function toPartyDto(party: Party): PartyDto {
  return {
    id: party.id,
    type: party.type,
    name: party.name,
    email: party.email,
    phone: party.phone,
    whatsapp: party.whatsapp,
    gstin: party.gstin,
    billingAddress: party.billingAddress,
    creditLimit: party.creditLimit === null ? null : decimalToNumber(party.creditLimit),
    creditDays: party.creditDays,
    openingBalance: party.openingBalance === null ? null : decimalToNumber(party.openingBalance),
    notes: party.notes,
    agentId: party.agentId,
    createdAt: party.createdAt.toISOString(),
    updatedAt: party.updatedAt.toISOString(),
  };
}

export function parseDueDate(value: string): Date {
  if (value.includes("T")) {
    return new Date(value);
  }
  return new Date(`${value}T12:00:00.000Z`);
}

export function computeInvoiceStatus(
  dueDate: Date,
  explicit?: "PENDING" | "OVERDUE" | "PAID",
): "PENDING" | "OVERDUE" | "PAID" {
  if (explicit === "PAID") return "PAID";
  if (explicit === "OVERDUE") return "OVERDUE";
  const now = new Date();
  return dueDate < now ? "OVERDUE" : "PENDING";
}
