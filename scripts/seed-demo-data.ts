/**
 * Realistic, moderate-volume demo data for manual browsing/testing.
 *
 * Seeds the organization owned by DEMO_CLERK_USER_EMAIL (defaults to
 * E2E_CLERK_USER_EMAIL) with ~6 months of a plausible small trading
 * business: multiple customers/suppliers, an agent, a handful of stock
 * items, and invoices/bills spanning paid/partially-paid/overdue/pending.
 * Every party contact and invoice clientEmail is set to
 * DEMO_CLIENT_EMAIL (defaults to parvgoyal58@gmail.com) so reminder
 * emails route to a real inbox during manual testing.
 *
 * Idempotent: upserts on natural unique keys (party name, invoice number,
 * bill number); payments are matched by their distinct `reference` string.
 * Safe to run repeatedly.
 *
 * NOTE: if this org is also the E2E fixture org, `npm run db:seed:e2e`
 * deletes any party/invoice/bill not in its own fixed set — re-run this
 * script after that if you want the demo data back.
 *
 * Run: npm run db:seed:demo
 */
import { prisma } from "../src/lib/db/prisma";

const CLIENT_EMAIL = process.env.DEMO_CLIENT_EMAIL ?? "parvgoyal58@gmail.com";

async function resolveOrganizationId(): Promise<string> {
  const email = process.env.DEMO_CLERK_USER_EMAIL ?? process.env.E2E_CLERK_USER_EMAIL;
  if (!email) {
    throw new Error("Set DEMO_CLERK_USER_EMAIL (or E2E_CLERK_USER_EMAIL) to the account to seed.");
  }
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new Error(`No User found for "${email}". Sign in once first.`);
  const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id } });
  if (!membership) throw new Error(`User "${email}" has no organization.`);
  return membership.organizationId;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number): Date {
  return daysAgo(-n);
}

interface InvoicePlan {
  number: string;
  customer: string;
  itemName: string;
  qty: number;
  rate: number;
  billedDaysAgo: number;
  dueDaysAgo: number; // negative = due in the future
  status: "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "PENDING";
  paidFraction: number; // 0, partial, or 1
}

interface BillPlan {
  number: string;
  supplier: string;
  billedDaysAgo: number;
  dueDaysAgo: number;
  amount: number;
  status: "PAID" | "PENDING";
  paidFraction: number;
}

async function main() {
  const organizationId = await resolveOrganizationId();

  // --- Parties ---------------------------------------------------------
  const agent = await prisma.party.upsert({
    where: { organizationId_name: { organizationId, name: "Suresh Mehta" } },
    update: { email: CLIENT_EMAIL },
    create: { organizationId, type: "AGENT", name: "Suresh Mehta", email: CLIENT_EMAIL },
  });

  const customerNames = [
    "Shree Ganesh Textiles",
    "Om Sai Traders",
    "Krishna Enterprises",
    "Laxmi Distributors",
    "Sunrise Hardware",
    "Patel Furnishings",
  ];
  const customers = new Map<string, { id: string }>();
  for (const [i, name] of customerNames.entries()) {
    const party = await prisma.party.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: { email: CLIENT_EMAIL, phone: "+91-98765" + String(43000 + i).padStart(5, "0") },
      create: {
        organizationId,
        type: "CUSTOMER",
        name,
        email: CLIENT_EMAIL,
        phone: "+91-98765" + String(43000 + i).padStart(5, "0"),
        agentId: i % 2 === 0 ? agent.id : undefined,
        creditDays: 30,
      },
    });
    customers.set(name, party);
  }

  const supplierNames = ["National Steel Co", "Global Packaging Ltd", "Metro Logistics"];
  const suppliers = new Map<string, { id: string }>();
  for (const name of supplierNames) {
    const party = await prisma.party.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: { email: CLIENT_EMAIL },
      create: { organizationId, type: "SUPPLIER", name, email: CLIENT_EMAIL },
    });
    suppliers.set(name, party);
  }

  // --- Items + opening stock --------------------------------------------
  const itemPlans = [
    { name: "Cotton Fabric Roll", unit: "MTR", opening: 400, sale: 220, purchase: 180 },
    { name: "Steel Pipe 2 inch", unit: "NOS", opening: 250, sale: 480, purchase: 400 },
    { name: "Packaging Box Large", unit: "NOS", opening: 600, sale: 35, purchase: 22 },
    { name: "LED Bulb 9W", unit: "NOS", opening: 300, sale: 90, purchase: 60 },
    { name: "Plywood Sheet 18mm", unit: "NOS", opening: 120, sale: 1450, purchase: 1150 },
  ] as const;
  const items = new Map<string, { id: string }>();
  for (const plan of itemPlans) {
    const item = await prisma.item.upsert({
      where: { organizationId_name: { organizationId, name: plan.name } },
      update: { unit: plan.unit, openingQty: plan.opening, salePrice: plan.sale, purchasePrice: plan.purchase },
      create: {
        organizationId,
        name: plan.name,
        unit: plan.unit,
        openingQty: plan.opening,
        salePrice: plan.sale,
        purchasePrice: plan.purchase,
        reorderLevel: Math.round(plan.opening * 0.15),
      },
    });
    items.set(plan.name, item);
    const existingOpening = await prisma.stockMovement.findFirst({
      where: { organizationId, itemId: item.id, sourceType: "OPENING" },
    });
    if (!existingOpening) {
      await prisma.stockMovement.create({
        data: { organizationId, itemId: item.id, qty: plan.opening, sourceType: "OPENING", movementDate: daysAgo(180) },
      });
    }
  }

  // --- Invoices: ~6 months of receivables history -----------------------
  const invoicePlans: InvoicePlan[] = [
    { number: "DEMO-INV-001", customer: "Shree Ganesh Textiles", itemName: "Cotton Fabric Roll", qty: 150, rate: 220, billedDaysAgo: 165, dueDaysAgo: 135, status: "PAID", paidFraction: 1 },
    { number: "DEMO-INV-002", customer: "Om Sai Traders", itemName: "Steel Pipe 2 inch", qty: 40, rate: 480, billedDaysAgo: 150, dueDaysAgo: 120, status: "PAID", paidFraction: 1 },
    { number: "DEMO-INV-003", customer: "Krishna Enterprises", itemName: "Packaging Box Large", qty: 500, rate: 35, billedDaysAgo: 140, dueDaysAgo: 110, status: "PAID", paidFraction: 1 },
    { number: "DEMO-INV-004", customer: "Laxmi Distributors", itemName: "LED Bulb 9W", qty: 200, rate: 90, billedDaysAgo: 120, dueDaysAgo: 90, status: "PAID", paidFraction: 1 },
    { number: "DEMO-INV-005", customer: "Sunrise Hardware", itemName: "Plywood Sheet 18mm", qty: 20, rate: 1450, billedDaysAgo: 100, dueDaysAgo: 70, status: "PAID", paidFraction: 1 },
    { number: "DEMO-INV-006", customer: "Patel Furnishings", itemName: "Cotton Fabric Roll", qty: 80, rate: 220, billedDaysAgo: 95, dueDaysAgo: 65, status: "PAID", paidFraction: 1 },
    { number: "DEMO-INV-007", customer: "Shree Ganesh Textiles", itemName: "Steel Pipe 2 inch", qty: 60, rate: 480, billedDaysAgo: 80, dueDaysAgo: 50, status: "PAID", paidFraction: 1 },
    { number: "DEMO-INV-008", customer: "Om Sai Traders", itemName: "Packaging Box Large", qty: 350, rate: 35, billedDaysAgo: 70, dueDaysAgo: 40, status: "PARTIALLY_PAID", paidFraction: 0.5 },
    { number: "DEMO-INV-009", customer: "Krishna Enterprises", itemName: "LED Bulb 9W", qty: 250, rate: 90, billedDaysAgo: 60, dueDaysAgo: 30, status: "PARTIALLY_PAID", paidFraction: 0.6 },
    { number: "DEMO-INV-010", customer: "Laxmi Distributors", itemName: "Plywood Sheet 18mm", qty: 15, rate: 1450, billedDaysAgo: 55, dueDaysAgo: 25, status: "OVERDUE", paidFraction: 0 },
    { number: "DEMO-INV-011", customer: "Sunrise Hardware", itemName: "Cotton Fabric Roll", qty: 100, rate: 220, billedDaysAgo: 50, dueDaysAgo: 20, status: "OVERDUE", paidFraction: 0 },
    { number: "DEMO-INV-012", customer: "Patel Furnishings", itemName: "Steel Pipe 2 inch", qty: 30, rate: 480, billedDaysAgo: 45, dueDaysAgo: 15, status: "OVERDUE", paidFraction: 0 },
    { number: "DEMO-INV-013", customer: "Shree Ganesh Textiles", itemName: "Packaging Box Large", qty: 400, rate: 35, billedDaysAgo: 35, dueDaysAgo: 5, status: "OVERDUE", paidFraction: 0 },
    { number: "DEMO-INV-014", customer: "Om Sai Traders", itemName: "LED Bulb 9W", qty: 180, rate: 90, billedDaysAgo: 25, dueDaysAgo: -5, status: "PENDING", paidFraction: 0 },
    { number: "DEMO-INV-015", customer: "Krishna Enterprises", itemName: "Plywood Sheet 18mm", qty: 10, rate: 1450, billedDaysAgo: 20, dueDaysAgo: -10, status: "PENDING", paidFraction: 0 },
    { number: "DEMO-INV-016", customer: "Laxmi Distributors", itemName: "Cotton Fabric Roll", qty: 120, rate: 220, billedDaysAgo: 14, dueDaysAgo: -16, status: "PENDING", paidFraction: 0 },
    { number: "DEMO-INV-017", customer: "Sunrise Hardware", itemName: "Steel Pipe 2 inch", qty: 50, rate: 480, billedDaysAgo: 7, dueDaysAgo: -23, status: "PENDING", paidFraction: 0 },
    { number: "DEMO-INV-018", customer: "Patel Furnishings", itemName: "Packaging Box Large", qty: 300, rate: 35, billedDaysAgo: 3, dueDaysAgo: -27, status: "PENDING", paidFraction: 0 },
  ];

  for (const plan of invoicePlans) {
    const customer = customers.get(plan.customer)!;
    const item = items.get(plan.itemName)!;
    const amount = plan.qty * plan.rate;
    const amountPaid = Math.round(amount * plan.paidFraction);
    const dueDate = daysAgo(plan.dueDaysAgo);

    const invoice = await prisma.invoice.upsert({
      where: { organizationId_invoiceNumber: { organizationId, invoiceNumber: plan.number } },
      update: {
        status: plan.status,
        dueDate,
        amount,
        subtotal: amount,
        taxAmount: 0,
        totalAmount: amount,
        amountPaid,
        partyId: customer.id,
        clientName: plan.customer,
        clientEmail: CLIENT_EMAIL,
        createdAt: daysAgo(plan.billedDaysAgo),
      },
      create: {
        organizationId,
        clientName: plan.customer,
        clientEmail: CLIENT_EMAIL,
        invoiceNumber: plan.number,
        status: plan.status,
        type: "RECEIVABLE",
        dueDate,
        amount,
        subtotal: amount,
        taxAmount: 0,
        totalAmount: amount,
        amountPaid,
        partyId: customer.id,
        createdAt: daysAgo(plan.billedDaysAgo),
      },
    });

    const existingLine = await prisma.invoiceLineItem.findFirst({
      where: { organizationId, invoiceId: invoice.id, itemId: item.id },
    });
    if (!existingLine) {
      await prisma.invoiceLineItem.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          itemId: item.id,
          description: plan.itemName,
          quantity: plan.qty,
          rate: plan.rate,
          discount: 0,
          taxRate: 0,
          amount,
          sortOrder: 0,
        },
      });
    }

    if (amountPaid > 0) {
      const reference = `${plan.number}-PMT`;
      let payment = await prisma.payment.findFirst({ where: { organizationId, reference } });
      if (!payment) {
        payment = await prisma.payment.create({
          data: {
            organizationId,
            partyId: customer.id,
            direction: "IN",
            amount: amountPaid,
            unallocated: 0,
            mode: "BANK_TRANSFER",
            paymentDate: daysAgo(Math.max(plan.dueDaysAgo - 2, 1)),
            reference,
          },
        });
      }
      const existingAlloc = await prisma.paymentAllocation.findFirst({
        where: { organizationId, paymentId: payment.id, invoiceId: invoice.id },
      });
      if (!existingAlloc) {
        await prisma.paymentAllocation.create({
          data: { organizationId, paymentId: payment.id, invoiceId: invoice.id, amount: amountPaid },
        });
      }
    }
  }

  // --- Bills: payable history --------------------------------------------
  const billPlans: BillPlan[] = [
    { number: "DEMO-BILL-001", supplier: "National Steel Co", billedDaysAgo: 140, dueDaysAgo: 110, amount: 62000, status: "PAID", paidFraction: 1 },
    { number: "DEMO-BILL-002", supplier: "Global Packaging Ltd", billedDaysAgo: 100, dueDaysAgo: 70, amount: 18500, status: "PAID", paidFraction: 1 },
    { number: "DEMO-BILL-003", supplier: "Metro Logistics", billedDaysAgo: 75, dueDaysAgo: 45, amount: 9200, status: "PAID", paidFraction: 1 },
    { number: "DEMO-BILL-004", supplier: "National Steel Co", billedDaysAgo: 40, dueDaysAgo: 10, amount: 74500, status: "PENDING", paidFraction: 0 },
    { number: "DEMO-BILL-005", supplier: "Global Packaging Ltd", billedDaysAgo: 15, dueDaysAgo: -15, amount: 21300, status: "PENDING", paidFraction: 0 },
    { number: "DEMO-BILL-006", supplier: "Metro Logistics", billedDaysAgo: 5, dueDaysAgo: -25, amount: 6400, status: "PENDING", paidFraction: 0 },
  ];

  for (const plan of billPlans) {
    const supplier = suppliers.get(plan.supplier)!;
    const amountPaid = Math.round(plan.amount * plan.paidFraction);

    const bill = await prisma.bill.upsert({
      where: { organizationId_billNumber: { organizationId, billNumber: plan.number } },
      update: {
        status: plan.status,
        dueDate: daysAgo(plan.dueDaysAgo),
        billDate: daysAgo(plan.billedDaysAgo),
        amount: plan.amount,
        amountPaid,
        partyId: supplier.id,
      },
      create: {
        organizationId,
        partyId: supplier.id,
        billNumber: plan.number,
        billDate: daysAgo(plan.billedDaysAgo),
        dueDate: daysAgo(plan.dueDaysAgo),
        amount: plan.amount,
        amountPaid,
        status: plan.status,
      },
    });

    if (amountPaid > 0) {
      const reference = `${plan.number}-PMT`;
      let payment = await prisma.payment.findFirst({ where: { organizationId, reference } });
      if (!payment) {
        payment = await prisma.payment.create({
          data: {
            organizationId,
            partyId: supplier.id,
            direction: "OUT",
            amount: amountPaid,
            unallocated: 0,
            mode: "BANK_TRANSFER",
            paymentDate: daysAgo(Math.max(plan.dueDaysAgo - 2, 1)),
            reference,
          },
        });
      }
      const existingAlloc = await prisma.paymentAllocation.findFirst({
        where: { organizationId, paymentId: payment.id, billId: bill.id },
      });
      if (!existingAlloc) {
        await prisma.paymentAllocation.create({
          data: { organizationId, paymentId: payment.id, billId: bill.id, amount: amountPaid },
        });
      }
    }
  }

  console.log(`Demo data seeded for organization ${organizationId} (contact email: ${CLIENT_EMAIL}).`);
  console.log(`Parties: ${customerNames.length} customers, ${supplierNames.length} suppliers, 1 agent.`);
  console.log(`Invoices: ${invoicePlans.length}. Bills: ${billPlans.length}. Items: ${itemPlans.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
