import Papa from "papaparse";
import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { partyService } from "@/server/services/party.service";

/** Filesystem-safe filename fragment — collapse anything but alnum/-/_ into a single dash. */
function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "party";
}

export const STATEMENT_CSV_HEADER = ["Date", "Document", "Debit", "Credit", "Balance"] as const;

/** Builds the statement CSV body (header row + one row per ledger entry) — exported for unit testing. */
export function buildStatementCsv(
  ledger: Awaited<ReturnType<typeof partyService.ledger>>,
): string {
  return Papa.unparse({
    fields: [...STATEMENT_CSV_HEADER],
    data: ledger.map((entry) => [
      entry.date,
      `${entry.docType} ${entry.docNumber}`,
      entry.debit ?? "",
      entry.credit ?? "",
      entry.balance,
    ]),
  });
}

/**
 * `?format=csv` (default) streams a CSV attachment built server-side from
 * `partyService.ledger`. `?format=pdf` redirects to the print view
 * (Task 13's browser print-to-PDF pattern) — no server-side PDF rendering.
 */
export const GET = withApiHandler(async (request, ctx, params) => {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "csv";

  if (format === "pdf") {
    return NextResponse.redirect(
      new URL(`/dashboard/parties/${params.id}/statement/print`, request.url),
    );
  }

  const [party, ledger] = await Promise.all([
    partyService.get(ctx.organizationId, params.id),
    partyService.ledger(ctx.organizationId, params.id),
  ]);

  const csv = buildStatementCsv(ledger);
  const filename = `statement-${sanitizeFilename(party.name)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
