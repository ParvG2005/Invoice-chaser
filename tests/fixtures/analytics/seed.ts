import type { PrismaClient } from "@/generated/prisma/client";

export const ORG_ID = "org-analytics-fixture";
export const AS_OF = new Date("2026-07-15T12:00:00Z");

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

// NOTE: the Phase 1 schema has no distinct `issueDate` or `balanceDue`
// columns on Invoice/Bill (see Cross-Phase Interface Contract deviation
// recorded in analytics.service.ts). `createdAt` stands in for "issue
// date" — it's explicitly set here rather than left to `@default(now())`.
// `balanceDue` is computed in SQL as `COALESCE(total_amount, amount) -
// amount_paid` for invoices and `amount - amount_paid` for bills.
export async function seedAnalyticsFixture(prisma: PrismaClient): Promise<void> {
  await prisma.organization.create({
    data: { id: ORG_ID, name: "Analytics Fixture Co", slug: "analytics-fixture" },
  });

  await prisma.party.createMany({
    data: [
      { id: "party-a1", organizationId: ORG_ID, name: "Agent Anil", type: "AGENT" },
      { id: "party-a2", organizationId: ORG_ID, name: "Agent Bina", type: "AGENT" },
      {
        id: "party-p1", organizationId: ORG_ID, name: "Acme Traders", type: "CUSTOMER",
        creditLimit: "50000.00", creditDays: 30, agentId: "party-a1",
      },
      {
        id: "party-p2", organizationId: ORG_ID, name: "Bharat Mills", type: "CUSTOMER",
        creditLimit: "40000.00", creditDays: 45, agentId: "party-a2",
      },
      { id: "party-p3", organizationId: ORG_ID, name: "Chandra Supplies", type: "SUPPLIER" },
    ],
  });

  const invoice = (n: {
    id: string; number: string; partyId: string; partyName: string;
    issue: string; due: string; total: string; paid: string;
    status: "PENDING" | "OVERDUE" | "PAID"; paidAt?: string;
  }) =>
    prisma.invoice.create({
      data: {
        id: n.id, organizationId: ORG_ID, invoiceNumber: n.number,
        type: "RECEIVABLE", partyId: n.partyId,
        clientName: n.partyName, clientEmail: `${n.partyId}@fixture.test`,
        amount: n.total, totalAmount: n.total, amountPaid: n.paid,
        currency: "INR", createdAt: d(n.issue), dueDate: d(n.due),
        status: n.status, paidAt: n.paidAt ? d(n.paidAt) : null,
      },
    });

  await invoice({ id: "inv-001", number: "INV-001", partyId: "party-p1", partyName: "Acme Traders", issue: "2026-05-11", due: "2026-06-10", total: "10000.00", paid: "10000.00", status: "PAID", paidAt: "2026-07-05" });
  await invoice({ id: "inv-002", number: "INV-002", partyId: "party-p1", partyName: "Acme Traders", issue: "2026-06-01", due: "2026-07-01", total: "20000.00", paid: "5000.00", status: "OVERDUE" });
  await invoice({ id: "inv-003", number: "INV-003", partyId: "party-p1", partyName: "Acme Traders", issue: "2026-04-30", due: "2026-05-30", total: "8000.00", paid: "0.00", status: "OVERDUE" });
  await invoice({ id: "inv-004", number: "INV-004", partyId: "party-p2", partyName: "Bharat Mills", issue: "2026-06-25", due: "2026-07-25", total: "40000.00", paid: "0.00", status: "PENDING" });
  await invoice({ id: "inv-005", number: "INV-005", partyId: "party-p2", partyName: "Bharat Mills", issue: "2026-01-30", due: "2026-03-01", total: "12000.00", paid: "0.00", status: "OVERDUE" });
  await invoice({ id: "inv-006", number: "INV-006", partyId: "party-p1", partyName: "Acme Traders", issue: "2026-03-16", due: "2026-04-15", total: "5000.00", paid: "5000.00", status: "PAID", paidAt: "2026-04-20" });

  await prisma.bill.createMany({
    data: [
      { id: "bill-001", organizationId: ORG_ID, billNumber: "BILL-001", partyId: "party-p3", billDate: d("2026-06-20"), dueDate: d("2026-07-20"), amount: "18000.00", amountPaid: "0.00", status: "PENDING", currency: "INR" },
      { id: "bill-002", organizationId: ORG_ID, billNumber: "BILL-002", partyId: "party-p3", billDate: d("2026-05-20"), dueDate: d("2026-06-20"), amount: "7000.00", amountPaid: "2000.00", status: "OVERDUE", currency: "INR" },
    ],
  });

  await prisma.payment.create({ data: { id: "pay-001", organizationId: ORG_ID, partyId: "party-p1", direction: "IN", amount: "10000.00", paymentDate: d("2026-07-05"), allocations: { create: [{ organizationId: ORG_ID, invoiceId: "inv-001", amount: "10000.00" }] } } });
  await prisma.payment.create({ data: { id: "pay-002", organizationId: ORG_ID, partyId: "party-p1", direction: "IN", amount: "5000.00", paymentDate: d("2026-07-10"), allocations: { create: [{ organizationId: ORG_ID, invoiceId: "inv-002", amount: "5000.00" }] } } });
  await prisma.payment.create({ data: { id: "pay-003", organizationId: ORG_ID, partyId: "party-p1", direction: "IN", amount: "5000.00", paymentDate: d("2026-04-20"), allocations: { create: [{ organizationId: ORG_ID, invoiceId: "inv-006", amount: "5000.00" }] } } });
  await prisma.payment.create({ data: { id: "pay-004", organizationId: ORG_ID, partyId: "party-p3", direction: "OUT", amount: "2000.00", paymentDate: d("2026-07-08"), allocations: { create: [{ organizationId: ORG_ID, billId: "bill-002", amount: "2000.00" }] } } });

  await prisma.item.createMany({
    data: [
      { id: "item-1", organizationId: ORG_ID, name: "Steel Rod 12mm", sku: "STL-12", unit: "KG", purchasePrice: "60.00", salePrice: "75.00", reorderLevel: "150.000" },
      { id: "item-2", organizationId: ORG_ID, name: "Copper Wire", sku: "CU-01", unit: "MTR", purchasePrice: "20.00", salePrice: "28.00", reorderLevel: "50.000" },
    ],
  });

  await prisma.stockMovement.createMany({
    data: [
      { organizationId: ORG_ID, itemId: "item-1", qty: "500.000", rate: "60.00", sourceType: "OPENING", movementDate: d("2026-01-05") },
      { organizationId: ORG_ID, itemId: "item-1", qty: "-420.000", rate: "75.00", sourceType: "INVOICE", movementDate: d("2026-06-20") },
      { organizationId: ORG_ID, itemId: "item-1", qty: "50.000", rate: "62.00", sourceType: "BILL", movementDate: d("2026-07-01") },
      { organizationId: ORG_ID, itemId: "item-2", qty: "200.000", rate: "20.00", sourceType: "OPENING", movementDate: d("2026-01-05") },
    ],
  });
}
