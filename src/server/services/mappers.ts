import type {
  Bill,
  Invoice,
  InvoiceLineItem,
  Item,
  Party,
  StockMovement,
} from "@/generated/prisma/client";
import type { BillDto, InvoiceDto, ItemDto, PartyDto, StockMovementDto } from "@/types";
import { decimalToNumber } from "@/lib/utils/currency";

/**
 * `findById` additively includes `party`/`lineItems` (Task 13, invoice detail
 * page); every other Invoice-returning repository method still returns a
 * bare `Invoice`, so both relations are optional here and simply omitted
 * from the DTO when absent.
 */
type InvoiceWithRelations = Invoice & {
  party?: Party | null;
  lineItems?: InvoiceLineItem[];
};

export function toInvoiceDto(invoice: InvoiceWithRelations): InvoiceDto {
  return {
    id: invoice.id,
    clientName: invoice.clientName,
    clientEmail: invoice.clientEmail,
    clientPhone: invoice.clientPhone,
    amount: decimalToNumber(invoice.amount),
    currency: invoice.currency,
    dueDate: invoice.dueDate.toISOString(),
    invoiceNumber: invoice.invoiceNumber,
    notes: invoice.notes,
    status: invoice.status,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    partyId: invoice.partyId,
    subtotal: invoice.subtotal === null ? null : decimalToNumber(invoice.subtotal),
    taxAmount: invoice.taxAmount === null ? null : decimalToNumber(invoice.taxAmount),
    totalAmount: invoice.totalAmount === null ? null : decimalToNumber(invoice.totalAmount),
    amountPaid: decimalToNumber(invoice.amountPaid),
    party: invoice.party && !invoice.party.deletedAt
      ? { id: invoice.party.id, name: invoice.party.name, type: invoice.party.type }
      : null,
    lineItems: invoice.lineItems
      ? invoice.lineItems.map((li) => ({
          id: li.id,
          itemId: li.itemId,
          description: li.description,
          quantity: decimalToNumber(li.quantity),
          rate: decimalToNumber(li.rate),
          amount: decimalToNumber(li.amount),
          discountPct: decimalToNumber(li.discount),
          taxRatePct: decimalToNumber(li.taxRate),
        }))
      : undefined,
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

export function toBillDto(bill: Bill): BillDto {
  const amount = decimalToNumber(bill.amount);
  const amountPaid = decimalToNumber(bill.amountPaid);
  return {
    id: bill.id,
    partyId: bill.partyId,
    billNumber: bill.billNumber,
    billDate: bill.billDate?.toISOString() ?? null,
    dueDate: bill.dueDate.toISOString(),
    amount,
    amountPaid,
    outstanding: Math.round((amount - amountPaid) * 100) / 100,
    currency: bill.currency,
    status: bill.status,
    notes: bill.notes,
    paidAt: bill.paidAt?.toISOString() ?? null,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
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
  explicit?: "PENDING" | "OVERDUE" | "PAID" | "PARTIALLY_PAID" | "WRITTEN_OFF",
): "PENDING" | "OVERDUE" | "PAID" | "PARTIALLY_PAID" | "WRITTEN_OFF" {
  if (explicit === "PAID" || explicit === "PARTIALLY_PAID" || explicit === "WRITTEN_OFF") {
    return explicit;
  }
  if (explicit === "OVERDUE") return "OVERDUE";
  const now = new Date();
  return dueDate < now ? "OVERDUE" : "PENDING";
}
