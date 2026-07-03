import type { EmailTone, InvoiceStatus, ReminderStatus } from "@prisma/client";

export type { EmailTone, InvoiceStatus, ReminderStatus };

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
