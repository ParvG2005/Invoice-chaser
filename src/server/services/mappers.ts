import type { Invoice, Item, Party, StockMovement } from "@/generated/prisma/client";
import type { InvoiceDto, ItemDto, PartyDto, StockMovementDto } from "@/types";
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

export function toItemDto(item: Item): ItemDto {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    hsnCode: item.hsnCode,
    gstRate: item.gstRate === null ? null : decimalToNumber(item.gstRate),
    openingQty: decimalToNumber(item.openingQty),
    reorderLevel: item.reorderLevel === null ? null : decimalToNumber(item.reorderLevel),
    purchasePrice: item.purchasePrice === null ? null : decimalToNumber(item.purchasePrice),
    salePrice: item.salePrice === null ? null : decimalToNumber(item.salePrice),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toStockMovementDto(movement: StockMovement): StockMovementDto {
  return {
    id: movement.id,
    itemId: movement.itemId,
    qty: decimalToNumber(movement.qty),
    rate: movement.rate === null ? null : decimalToNumber(movement.rate),
    sourceType: movement.sourceType,
    sourceId: movement.sourceId,
    godown: movement.godown,
    movementDate: movement.movementDate.toISOString(),
    createdAt: movement.createdAt.toISOString(),
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
