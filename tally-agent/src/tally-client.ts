interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}

type FetchLike = (
  url: string,
  init: FetchInit,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export function buildExportRequest(
  report: "Ledgers" | "List of Accounts" | "Day Book",
  opts: { from?: string; to?: string } = {},
): string {
  const period =
    opts.from && opts.to
      ? `<SVFROMDATE>${opts.from}</SVFROMDATE><SVTODATE>${opts.to}</SVTODATE>`
      : "";
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>${report}</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${period}</STATICVARIABLES></DESC></BODY></ENVELOPE>`;
}

export async function fetchFromTally(
  host: string,
  port: number,
  requestXml: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<string> {
  const res = await fetchImpl(`http://${host}:${port}`, {
    method: "POST",
    headers: { "content-type": "text/xml" },
    body: requestXml,
  });
  if (!res.ok) throw new Error(`Tally gateway ${host}:${port} returned ${res.status}`);
  return res.text();
}
