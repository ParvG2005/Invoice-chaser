/** Shared shapes for the pure Tally Prime XML parsers. No I/O, no Prisma. */

export interface ParseWarning {
  /** Human-locatable position, e.g. "VOUCHER[12] INV-042" */
  path: string;
  message: string;
}

export interface ParseResult<T> {
  records: T[];
  warnings: ParseWarning[];
}

export interface TallyLedger {
  guid: string;
  alterId: number;
  name: string;
  /** Tally group, e.g. "Sundry Debtors" / "Sundry Creditors" */
  parent: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  /** From BILLCREDITPERIOD, days */
  creditPeriodDays?: number;
  /** Tally sign convention preserved: positive = credit balance */
  openingBalance: number;
  isBillWiseOn: boolean;
}

export interface TallyStockItem {
  guid: string;
  alterId: number;
  name: string;
  /** BASEUNITS, e.g. "nos" */
  unit: string;
  hsnCode?: string;
  /** Percent, e.g. 18 */
  gstRate?: number;
  openingQty: number;
  openingRate: number;
}

export type TallyVoucherKind =
  | "SALES"
  | "PURCHASE"
  | "RECEIPT"
  | "PAYMENT"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "UNSUPPORTED";

export interface TallyBillAllocation {
  /** Bill reference name — for Agst Ref this is the invoice/bill number it settles */
  name: string;
  /** "New Ref" | "Agst Ref" | "Advance" | "On Account" */
  billType: string;
  amount: number;
}

export interface TallyLedgerEntry {
  ledgerName: string;
  /** Raw Tally sign: negative = debit, positive = credit */
  amount: number;
  isPartyLedger: boolean;
  billAllocations: TallyBillAllocation[];
}

export interface TallyInventoryEntry {
  stockItemName: string;
  quantity: number;
  rate: number;
  amount: number;
  unit?: string;
}

export interface TallyVoucher {
  guid: string;
  alterId: number;
  voucherNumber: string;
  /** Raw VOUCHERTYPENAME as exported */
  voucherTypeName: string;
  kind: TallyVoucherKind;
  /** ISO date YYYY-MM-DD */
  date: string;
  partyLedgerName: string;
  narration?: string;
  ledgerEntries: TallyLedgerEntry[];
  inventoryEntries: TallyInventoryEntry[];
}
