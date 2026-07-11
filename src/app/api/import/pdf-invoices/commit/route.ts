import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { pdfImportCommitSchema } from "@/lib/validations/invoice";
import { invoiceService } from "@/server/services/invoice.service";

/**
 * Commits the PDF-invoice import (wizard "PDF Invoices" tab). Unlike the
 * generic POST /api/invoices/bulk (which only writes the invoice + line
 * items), this path also enriches master data: it upserts the buyer Party and
 * creates/links per-line Stock Items. Mirrors /api/invoices/bulk's role +
 * rate-limit guards.
 */
export const POST = withApiHandler(
  async (request, ctx) => {
    const body = await request.json();
    const { invoices } = pdfImportCommitSchema.parse(body);
    const created = await invoiceService.importPdfInvoices(ctx.organizationId, invoices);
    return successResponse(created, 201);
  },
  { rateLimit: { limit: 10, windowMs: 60_000 }, requiredRole: "member" },
);
