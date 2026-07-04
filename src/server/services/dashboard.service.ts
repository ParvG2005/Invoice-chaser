import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/utils/currency";
import type { DashboardStats } from "@/types";

export const dashboardService = {
  async getStats(organizationId: string): Promise<DashboardStats> {
    // Aggregate counts + sums in the database (indexed on [organizationId, status])
    // instead of pulling every invoice row into the app and reducing in JS.
    const [byStatus, remindersSent, emailSent, recentReminders, recentPaid, invoicesDueSoon] =
      await Promise.all([
        prisma.invoice.groupBy({
          by: ["status"],
          where: { organizationId, deletedAt: null },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        prisma.reminder.count({
          where: { organizationId, status: "SENT" },
        }),
        prisma.emailLog.count({
          where: { organizationId, status: "SENT" },
        }),
        prisma.reminder.findMany({
          where: { organizationId, status: "SENT" },
          orderBy: { sentAt: "desc" },
          take: 5,
          include: { invoice: true },
        }),
        prisma.invoice.findMany({
          where: { organizationId, status: "PAID", deletedAt: null },
          orderBy: { paidAt: "desc" },
          take: 5,
        }),
        prisma.invoice.findMany({
          where: {
            organizationId,
            deletedAt: null,
            status: { in: ["PENDING", "OVERDUE", "PARTIALLY_PAID"] },
          },
          orderBy: { dueDate: "asc" },
          take: 10,
        }),
      ]);

    const invoiceCountByStatus = {
      PENDING: 0,
      OVERDUE: 0,
      PAID: 0,
      PARTIALLY_PAID: 0,
      WRITTEN_OFF: 0,
    };
    let totalUnpaidAmount = 0;
    let recoveredAmount = 0;
    let pendingValue = 0;
    let overdueValue = 0;

    for (const group of byStatus) {
      const count = group._count._all;
      const sum = group._sum.amount ? decimalToNumber(group._sum.amount) : 0;
      invoiceCountByStatus[group.status] = count;
      if (group.status === "PAID") {
        recoveredAmount += sum;
      } else {
        totalUnpaidAmount += sum;
      }
      if (group.status === "PENDING") pendingValue = sum;
      if (group.status === "OVERDUE") overdueValue = sum;
    }

    const overdueCount = invoiceCountByStatus.OVERDUE;
    const pendingCount = invoiceCountByStatus.PENDING;

    const recentActivity: DashboardStats["recentActivity"] = [
      ...recentReminders.map((r) => ({
        id: r.id,
        type: "reminder_sent" as const,
        label: `Reminder sent to ${r.invoice?.clientName ?? "client"}`,
        createdAt: (r.sentAt ?? r.createdAt).toISOString(),
      })),
      ...recentPaid.map((i) => ({
        id: i.id,
        type: "invoice_paid" as const,
        label: `Invoice ${i.invoiceNumber} marked paid`,
        createdAt: (i.paidAt ?? i.updatedAt).toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);

    return {
      totalUnpaidAmount,
      overdueCount,
      remindersSent: Math.max(remindersSent, emailSent),
      recoveredAmount,
      invoiceCountByStatus,
      recentActivity,
      moneyToCome: totalUnpaidAmount.toString(),
      // TODO(phase-1): wire to billService.outstandingTotal(organizationId) once it exists.
      moneyToPay: "0",
      pendingCount,
      pendingValue: pendingValue.toString(),
      overdueValue: overdueValue.toString(),
      invoicesDueSoon: invoicesDueSoon.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        amount: decimalToNumber(invoice.amount),
        dueDate: invoice.dueDate.toISOString(),
        status: invoice.status,
      })),
    };
  },
};
