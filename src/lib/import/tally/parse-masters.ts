import {
  parseTallyEnvelope,
  asArray,
  text,
  num,
  parseTallyQuantity,
  parseTallyRate,
} from "@/lib/import/tally/xml";
import type { ParseResult, ParseWarning, TallyLedger, TallyStockItem } from "@/lib/import/tally/types";

/** Extract "30" from "30 Days"; Tally may also export plain "30". */
function parseCreditPeriodDays(raw: string): number | undefined {
  const match = raw.trim().match(/^\d+/);
  return match ? Number.parseInt(match[0], 10) : undefined;
}

export function parseLedgers(xml: string): ParseResult<TallyLedger> {
  const messages = parseTallyEnvelope(xml);
  const records: TallyLedger[] = [];
  const warnings: ParseWarning[] = [];

  let index = -1;
  for (const message of messages) {
    for (const node of asArray<Record<string, unknown>>(
      message.LEDGER as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )) {
      index += 1;
      const name = text(node["@_NAME"]) || text(node.NAME);
      const guid = text(node.GUID);
      const path = `LEDGER[${index}] ${name || "(unnamed)"}`;

      if (!guid) {
        warnings.push({ path, message: "Skipped: no GUID (re-export with default XML settings)" });
        continue;
      }
      if (!name) {
        warnings.push({ path, message: "Skipped: no NAME attribute" });
        continue;
      }

      const addressList = node["ADDRESS.LIST"] as Record<string, unknown> | undefined;
      const addressLines = asArray(addressList?.ADDRESS).map(text).filter(Boolean);

      records.push({
        guid,
        alterId: num(node.ALTERID),
        name,
        parent: text(node.PARENT),
        email: text(node.EMAIL) || undefined,
        phone: text(node.LEDGERPHONE) || text(node.LEDGERMOBILE) || undefined,
        gstin: text(node.PARTYGSTIN) || text(node.GSTIN) || undefined,
        address: addressLines.length > 0 ? addressLines.join(", ") : undefined,
        creditPeriodDays: parseCreditPeriodDays(text(node.BILLCREDITPERIOD) || text(node.CREDITPERIOD)),
        openingBalance: num(node.OPENINGBALANCE),
        isBillWiseOn: text(node.ISBILLWISEON).toLowerCase() === "yes",
      });
    }
  }

  return { records, warnings };
}

/** GST rate lives deep in GSTDETAILS.LIST or at top level; prefer the IGST duty head (full rate). */
function extractGstDetails(node: Record<string, unknown>): { hsnCode?: string; gstRate?: number } {
  // Check top-level tags first (real fixture structure)
  let hsnCode = text(node.GSTHSNCODE) || text(node.HSNCODE) || undefined;
  const topLevelRate = num(node.GSTRATE);
  let gstRate: number | undefined = topLevelRate > 0 ? topLevelRate : undefined;

  // If no nested GSTDETAILS.LIST, return early
  const gstDetailsList = node["GSTDETAILS.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (!gstDetailsList) {
    return { hsnCode, gstRate };
  }

  // Search nested structure (synthetic test structure)
  for (const gst of asArray<Record<string, unknown>>(gstDetailsList)) {
    hsnCode = text(gst.HSNCODE) || hsnCode;
    for (const state of asArray<Record<string, unknown>>(
      gst["STATEWISEDETAILS.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )) {
      for (const rate of asArray<Record<string, unknown>>(
        state["RATEDETAILS.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
      )) {
        const head = text(rate.GSTRATEDUTYHEAD).toUpperCase();
        const value = num(rate.GSTRATE);
        if (value > 0 && (head.includes("IGST") || gstRate === undefined)) {
          gstRate = value;
        }
      }
    }
  }
  return { hsnCode, gstRate };
}

export function parseStockItems(xml: string): ParseResult<TallyStockItem> {
  const messages = parseTallyEnvelope(xml);
  const records: TallyStockItem[] = [];
  const warnings: ParseWarning[] = [];

  let index = -1;
  for (const message of messages) {
    for (const node of asArray<Record<string, unknown>>(
      message.STOCKITEM as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )) {
      index += 1;
      const name = text(node["@_NAME"]) || text(node.NAME);
      const guid = text(node.GUID);
      const path = `STOCKITEM[${index}] ${name || "(unnamed)"}`;

      if (!guid) {
        warnings.push({ path, message: "Skipped: no GUID" });
        continue;
      }
      if (!name) {
        warnings.push({ path, message: "Skipped: no NAME attribute" });
        continue;
      }

      const { hsnCode, gstRate } = extractGstDetails(node);
      records.push({
        guid,
        alterId: num(node.ALTERID),
        name,
        unit: text(node.BASEUNITS) || "nos",
        hsnCode,
        gstRate,
        openingQty: parseTallyQuantity(text(node.OPENINGBALANCE)),
        openingRate: parseTallyRate(text(node.OPENINGRATE)),
      });
    }
  }
  return { records, warnings };
}
