import { buildExportRequest, fetchFromTally } from "./tally-client.ts";
import { uploadDoc } from "./uploader.ts";
import type { AgentConfig } from "./config.ts";

interface Deps {
  fetchTally?: (host: string, port: number, xml: string) => Promise<string>;
  upload?: (appUrl: string, apiKey: string, source: string, fileName: string, xml: string) => Promise<void>;
}

const SOURCES = [
  { source: "TALLY_MASTERS_LEDGERS", report: "Ledgers" as const, fileName: "masters-ledgers.xml", period: false },
  { source: "TALLY_MASTERS_STOCKITEMS", report: "List of Accounts" as const, fileName: "masters-stockitems.xml", period: false },
  { source: "TALLY_VOUCHERS", report: "Day Book" as const, fileName: "vouchers-daybook.xml", period: true },
];

export async function runSync(config: AgentConfig, deps: Deps = {}): Promise<void> {
  const fetchTally = deps.fetchTally ?? ((h, p, xml) => fetchFromTally(h, p, xml));
  const upload = deps.upload ?? ((a, k, s, f, x) => uploadDoc(a, k, s, f, x));
  for (const s of SOURCES) {
    const reqXml = buildExportRequest(
      s.report,
      s.period ? { from: config.voucherFrom, to: config.voucherTo } : {},
    );
    const xml = await fetchTally(config.tallyHost, config.tallyPort, reqXml);
    await upload(config.appUrl, config.apiKey, s.source, s.fileName, xml);
  }
}
