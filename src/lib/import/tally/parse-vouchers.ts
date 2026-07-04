import { parseTallyEnvelope, asArray, text, num, parseTallyDate, parseTallyQuantity, parseTallyRate } from "@/lib/import/tally/xml";
import type {
  ParseResult,
  ParseWarning,
  TallyBillAllocation,
  TallyInventoryEntry,
  TallyLedgerEntry,
  TallyVoucher,
  TallyVoucherKind,
} from "@/lib/import/tally/types";

const KIND_MAP: Array<[RegExp, TallyVoucherKind]> = [
  [/credit\s*note/i, "CREDIT_NOTE"],
  [/debit\s*note/i, "DEBIT_NOTE"],
  [/sales|tax\s*invoice|^invoice$/i, "SALES"],
  [/purchase/i, "PURCHASE"],
  [/receipt/i, "RECEIPT"],
  [/payment/i, "PAYMENT"],
];

export function classifyVoucherKind(voucherTypeName: string): TallyVoucherKind {
  const name = voucherTypeName.trim();
  if (!name) return "UNSUPPORTED";
  for (const [pattern, kind] of KIND_MAP) {
    if (pattern.test(name)) return kind;
  }
  return "UNSUPPORTED";
}

function parseBillAllocations(entry: Record<string, unknown>): TallyBillAllocation[] {
  return asArray<Record<string, unknown>>(
    entry["BILLALLOCATIONS.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
  )
    .map((b) => ({
      name: text(b.NAME),
      billType: text(b.BILLTYPE),
      amount: num(b.AMOUNT),
    }))
    .filter((b) => b.name !== "");
}

function parseLedgerEntries(node: Record<string, unknown>, partyLedgerName: string): TallyLedgerEntry[] {
  const raw = [
    ...asArray<Record<string, unknown>>(node["ALLLEDGERENTRIES.LIST"] as never),
    ...asArray<Record<string, unknown>>(node["LEDGERENTRIES.LIST"] as never),
  ];
  return raw.map((entry) => {
    const ledgerName = text(entry.LEDGERNAME);
    const isPartyFlag = text(entry.ISPARTYLEDGER).toLowerCase() === "yes";
    return {
      ledgerName,
      amount: num(entry.AMOUNT),
      isPartyLedger: isPartyFlag || (partyLedgerName !== "" && ledgerName === partyLedgerName),
      billAllocations: parseBillAllocations(entry),
    };
  });
}

function parseInventoryEntries(node: Record<string, unknown>): TallyInventoryEntry[] {
  const raw = [
    ...asArray<Record<string, unknown>>(node["ALLINVENTORYENTRIES.LIST"] as never),
    ...asArray<Record<string, unknown>>(node["INVENTORYENTRIES.LIST"] as never),
  ];
  return raw
    .map((entry) => {
      const qtyRaw = text(entry.ACTUALQTY) || text(entry.BILLEDQTY);
      const unitMatch = qtyRaw.match(/[a-zA-Z]+\s*$/);
      return {
        stockItemName: text(entry.STOCKITEMNAME),
        quantity: Math.abs(parseTallyQuantity(qtyRaw)),
        rate: parseTallyRate(text(entry.RATE)),
        amount: Math.abs(num(entry.AMOUNT)),
        unit: unitMatch ? unitMatch[0].trim() : undefined,
      };
    })
    .filter((e) => e.stockItemName !== "");
}

export function parseVouchers(xml: string): ParseResult<TallyVoucher> {
  const messages = parseTallyEnvelope(xml);
  const records: TallyVoucher[] = [];
  const warnings: ParseWarning[] = [];

  let index = -1;
  for (const message of messages) {
    for (const node of asArray<Record<string, unknown>>(
      message.VOUCHER as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )) {
      index += 1;
      const voucherNumber = text(node.VOUCHERNUMBER);
      const path = `VOUCHER[${index}] ${voucherNumber || "(no number)"}`;

      const guid = text(node.GUID);
      if (!guid) {
        warnings.push({ path, message: "Skipped: no GUID" });
        continue;
      }

      const date = parseTallyDate(text(node.DATE));
      if (!date) {
        warnings.push({ path, message: `Skipped: unparseable DATE "${text(node.DATE)}"` });
        continue;
      }

      const voucherTypeName = text(node.VOUCHERTYPENAME) || text(node["@_VCHTYPE"]);
      const kind = classifyVoucherKind(voucherTypeName);
      const partyLedgerName = text(node.PARTYLEDGERNAME) || text(node.PARTYNAME);

      records.push({
        guid,
        alterId: num(node.ALTERID),
        voucherNumber: voucherNumber || guid.slice(-12),
        voucherTypeName,
        kind,
        date,
        partyLedgerName,
        narration: text(node.NARRATION) || undefined,
        ledgerEntries: parseLedgerEntries(node, partyLedgerName),
        inventoryEntries: parseInventoryEntries(node),
      });
    }
  }
  return { records, warnings };
}
