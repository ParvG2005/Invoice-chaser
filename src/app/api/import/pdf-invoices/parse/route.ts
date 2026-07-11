import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { extractInvoicesFromPdf, type ExtractedInvoice } from "@/lib/import/pdf";
import { partyService } from "@/server/services/party.service";
import { PARTY_MAX_PAGE_SIZE } from "@/server/repositories/party.repository";

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 25;

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Every non-deleted party in the org, for the email/GSTIN auto-match index
 * below. `partyService.list` defaults to a 100-row page, which would
 * silently miss parties past the first page alphabetically — page through
 * with the repository's max page size until exhausted.
 */
async function fetchAllParties(organizationId: string) {
  const parties: Awaited<ReturnType<typeof partyService.list>> = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await partyService.list(organizationId, { take: PARTY_MAX_PAGE_SIZE, cursor });
    parties.push(...page);
    if (page.length < PARTY_MAX_PAGE_SIZE) break;
    cursor = page[page.length - 1]!.id;
  }
  return parties;
}

export const POST = withApiHandler(
  async (request, ctx) => {
    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new AppError("BAD_REQUEST", "No PDF files uploaded", 400);
    if (files.length > MAX_FILES) {
      throw new AppError("BAD_REQUEST", `Max ${MAX_FILES} files per upload`, 400);
    }

    // Party index for email matching (by GSTIN first, then normalized name).
    const parties = await fetchAllParties(ctx.organizationId);
    const byName = new Map(parties.map((p) => [norm(p.name), p]));
    const byGstin = new Map(
      parties.filter((p) => p.gstin).map((p) => [norm(p.gstin as string), p]),
    );
    const lookupParty = async (name: string, gstin?: string) => {
      const p = (gstin && byGstin.get(norm(gstin))) || byName.get(norm(name));
      return p ? { email: p.email ?? undefined } : null;
    };

    const results: ExtractedInvoice[] = [];
    for (const file of files) {
      if (file.size > MAX_PDF_BYTES) {
        results.push({
          fileName: file.name,
          method: "failed",
          needsEmail: true,
          warnings: ["File exceeds 4 MB"],
        });
        continue;
      }

      // extractInvoicesFromPdf's LLM fallback can throw (transient API
      // error, corrupt PDF); isolate per-file so one failure doesn't abort
      // the whole batch.
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        results.push(await extractInvoicesFromPdf(file.name, bytes, { lookupParty }));
      } catch (e) {
        results.push({
          fileName: file.name,
          method: "failed",
          needsEmail: true,
          warnings: [(e as Error).message ?? "Unknown extraction error"],
        });
      }
    }

    return successResponse({ results });
  },
  { rateLimit: { limit: 10, windowMs: 60_000 }, requiredRole: "member" },
);
