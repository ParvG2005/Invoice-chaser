import type { EmailTone, InvoiceStatus, PartyType, ReminderStatus } from "@/generated/prisma/client";

export type { EmailTone, InvoiceStatus, PartyType, ReminderStatus };

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface DashboardStats {
  totalUnpaidAmount: number;
  overdueCount: number;
  remindersSent: number;
  recoveredAmount: number;
  invoiceCountByStatus: Record<InvoiceStatus, number>;
  recentActivity: {
    id: string;
    type: "reminder_sent" | "invoice_paid" | "invoice_created";
    label: string;
    createdAt: string;
  }[];
  /** Receivables owed to the org across open invoices. */
  moneyToCome: string;
  /** Payables owed by the org across open bills. TODO(phase-1): wired to 0 until bill.service.ts exposes outstandingTotal. */
  moneyToPay: string;
  pendingCount: number;
  pendingValue: string;
  overdueValue: string;
  invoicesDueSoon: {
    id: string;
    invoiceNumber: string;
    clientName: string;
    amount: number;
    currency: string;
    dueDate: string;
    status: InvoiceStatus;
  }[];
}

export interface TimelineEntry {
  id: string;
  at: string;
  kind: "COMMUNICATION" | "PAYMENT";
  channel?: "EMAIL" | "WHATSAPP";
  status?: string;
  amount?: string;
  summary: string;
}

export interface InvoiceLineItemDto {
  id: string;
  /** Present when the line was created from a catalog item (Task 14 editor). */
  itemId?: string | null;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  discountPct: number;
  taxRatePct: number;
}

export interface InvoiceDto {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  amount: number;
  currency: string;
  dueDate: string;
  invoiceNumber: string;
  notes: string | null;
  status: InvoiceStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Additive detail-view fields (Task 13) — populated by `GET /api/invoices/[id]`. */
  partyId: string | null;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  amountPaid: number;
  party: { id: string; name: string; type: PartyType } | null;
  /** Only present when the source query included line items (invoice detail). */
  lineItems?: InvoiceLineItemDto[];
}

export interface PartyDto {
  id: string;
  type: PartyType;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  gstin: string | null;
  billingAddress: string | null;
  creditLimit: number | null;
  creditDays: number | null;
  openingBalance: number | null;
  notes: string | null;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemDto {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  hsnCode: string | null;
  gstRate: number | null;
  openingQty: number;
  reorderLevel: number | null;
  purchasePrice: number | null;
  salePrice: number | null;
  createdAt: string;
  updatedAt: string;
  /** Computed on read: openingQty + net movements (`stockService.getStockForItems`/`getItemStock`), not a persisted column. */
  stockOnHand: number;
  /** Computed on read: `stockOnHand * salePrice` (0 when salePrice is unset), rounded to 2dp. */
  valuation: number;
}

/**
 * Response shape of `GET /api/items?query=` (Task 14 item picker) — a thin,
 * search-specific projection, not the full `ItemDto`. `taxRate` here maps
 * from `Item.gstRate`; `stockOnHand` is computed on read
 * (`stockService.getStockForItems`), not a persisted column.
 */
export interface ItemSearchResultDto {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  salePrice: number | null;
  taxRate: number | null;
  stockOnHand: number;
}

export interface StockMovementDto {
  id: string;
  itemId: string;
  qty: number;
  rate: number | null;
  sourceType: "INVOICE" | "BILL" | "ADJUSTMENT" | "OPENING";
  sourceId: string | null;
  godown: string | null;
  notes: string | null;
  movementDate: string;
  createdAt: string;
}

export interface BillDto {
  id: string;
  partyId: string;
  billNumber: string;
  billDate: string | null;
  dueDate: string;
  amount: number;
  amountPaid: number;
  outstanding: number;
  currency: string;
  status: InvoiceStatus;
  notes: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Additive detail-view field (Task 19) — populated by `GET /api/bills/[id]` and list. */
  party: { id: string; name: string; type: PartyType } | null;
}

/** A payment applied to a single bill — used by the bill detail page's "Payments applied" section. */
export interface BillPaymentDto {
  id: string;
  amount: number;
  mode: string;
  paymentDate: string;
}

export interface PaymentAllocationDto {
  id: string;
  invoiceId: string | null;
  billId: string | null;
  amount: number;
}

export interface PaymentDto {
  id: string;
  partyId: string;
  direction: "IN" | "OUT";
  amount: number;
  unallocated: number;
  mode: "CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "CARD" | "OTHER";
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  currency: string;
  allocations: PaymentAllocationDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ReminderSequenceStepDto {
  offsetDays: number;
  tone: "FRIENDLY" | "PROFESSIONAL" | "FIRM" | "FINAL";
  channels: { email: boolean; whatsapp: boolean };
}

export interface QuietHoursDto {
  start: string;
  end: string;
}

export interface ReminderSettingsDto {
  reminderDays: number[];
  emailTone: EmailTone;
  autoSend: boolean;
  whatsappEnabled: boolean;
  /** Additive (Task 26): sequence editor + quiet hours. Not yet consumed by the scheduler. */
  sequence?: ReminderSequenceStepDto[];
  quietHours?: QuietHoursDto | null;
}

export interface InvoiceReminderDto {
  id: string;
  dayOffset: number;
  tone: EmailTone;
  status: "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";
  scheduledFor: string;
  sentAt: string | null;
}

export interface UpcomingReminderDto {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  partyName: string | null;
  channel: "EMAIL" | "WHATSAPP";
  scheduledFor: string;
  amount: number;
  currency: string;
}

export interface OrganizationSettingsDto {
  name: string;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  logoUrl: string | null;
  senderName: string | null;
  senderReplyTo: string | null;
  emailSignature: string | null;
  theme: "light" | "dark" | "system";
}

export interface GenerateEmailResult {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  whatsappText?: string;
}
