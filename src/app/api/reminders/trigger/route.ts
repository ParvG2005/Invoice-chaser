import { withApiHandler } from "@/lib/api/handler";
import { successResponse } from "@/lib/api/response";
import { reminderService } from "@/server/services/reminder.service";
import { createLogger } from "@/lib/logger";

const log = createLogger("reminders-trigger");

interface TriggerBody {
  /** Scope the scan to a single invoice (e.g. the row-level "Send reminder now" action). */
  invoiceId?: string;
  /** Scope the scan to a set of invoices (e.g. the bulk-actions "Send reminders" action). */
  invoiceIds?: string[];
}

export const POST = withApiHandler(
  async (request, ctx) => {
    const body: TriggerBody = await request.json().catch(() => ({}));
    const invoiceIds = body.invoiceIds ?? (body.invoiceId ? [body.invoiceId] : undefined);

    if (invoiceIds && invoiceIds.length > 0) {
      log.info("Manual per-invoice reminder scan triggered", {
        organizationId: ctx.organizationId,
        invoiceCount: invoiceIds.length,
      });

      const result = await reminderService.scheduleRemindersForInvoices(
        ctx.organizationId,
        invoiceIds,
      );

      log.info("Reminder scan complete", { scheduled: result.scheduled });
      return successResponse({ triggered: true, scheduled: result.scheduled });
    }

    log.info("Manual reminder scan triggered", { organizationId: ctx.organizationId });

    // No invoice scoping supplied: preserve the existing org-wide scan for
    // backward compatibility with any other caller.
    const result = await reminderService.scheduleRemindersForOrganization(ctx.organizationId);

    log.info("Reminder scan complete", { scheduled: result.scheduled });
    return successResponse({ triggered: true, scheduled: result.scheduled });
  },
  { requiredRole: "member" },
);
