import { prisma } from "@/lib/db/prisma";
import { getEmailProvider } from "@/lib/email";
import { createLogger } from "@/lib/logger";
import { analyticsService } from "@/server/services/analytics.service";
import { isDemoOrg } from "@/lib/demo";

const log = createLogger("notification-service");

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const notificationService = {
  /** Emails the org owner a low-stock digest. Returns true when a digest was sent. */
  async sendLowStockDigest(organizationId: string): Promise<boolean> {
    if (await isDemoOrg(organizationId)) return false;

    const stock = await analyticsService.getStockAnalytics(organizationId);
    if (stock.lowStockItems.length === 0) return false;

    const owner = await prisma.organizationMember.findFirst({
      where: { organizationId, role: "owner" },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    });
    if (!owner?.user.email) {
      log.warn("Low-stock digest skipped: no owner email", { organizationId });
      return false;
    }

    const rows = stock.lowStockItems
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.name)}${i.sku ? ` (${escapeHtml(i.sku)})` : ""}</td>` +
          `<td align="right">${i.currentQty} ${escapeHtml(i.unit)}</td>` +
          `<td align="right">${i.reorderLevel ?? "-"} ${escapeHtml(i.unit)}</td></tr>`,
      )
      .join("");
    const subject = `Low stock alert: ${stock.lowStockItems.length} item(s) below reorder level`;
    const html =
      `<h2>Low stock alert</h2>` +
      `<p>The following items are below their reorder level:</p>` +
      `<table border="1" cellpadding="6" cellspacing="0">` +
      `<tr><th>Item</th><th>In stock</th><th>Reorder level</th></tr>${rows}</table>` +
      `<p>Review stock on your <a href="/dashboard/analytics">analytics page</a>.</p>`;

    const result = await getEmailProvider().send({ to: owner.user.email, subject, html });
    await prisma.emailLog.create({
      data: {
        organizationId,
        toEmail: owner.user.email,
        subject,
        bodyHtml: html,
        status: result.success ? "SENT" : "FAILED",
        providerId: result.id,
        sentAt: result.success ? new Date() : null,
      },
    });
    return result.success;
  },
};
