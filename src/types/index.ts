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
}

export interface InvoiceDto {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  amount: number;
  dueDate: string;
  invoiceNumber: string;
  notes: string | null;
  status: InvoiceStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
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
}

export interface StockMovementDto {
  id: string;
  itemId: string;
  qty: number;
  rate: number | null;
  sourceType: "INVOICE" | "BILL" | "ADJUSTMENT" | "OPENING";
  sourceId: string | null;
  godown: string | null;
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

export interface ReminderSettingsDto {
  reminderDays: number[];
  emailTone: EmailTone;
  autoSend: boolean;
  whatsappEnabled: boolean;
}

export interface GenerateEmailResult {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  whatsappText?: string;
}
