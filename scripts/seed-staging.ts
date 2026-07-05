/**
 * Seeds a small, deterministic demo org for staging/preview environments.
 * Idempotent: keyed on the demo org's fixed slug; re-running exits early
 * if the org already exists. NEVER run against production.
 *
 * Run: SEED_ALLOW=staging npm run seed:staging
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../src/lib/db/prisma";

const DEMO_SLUG = "demo-staging-org";

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  if (process.env.SEED_ALLOW !== "staging") {
    throw new Error("Refusing to run: set SEED_ALLOW=staging explicitly.");
  }

  const existing = await prisma.organization.findFirst({ where: { slug: DEMO_SLUG } });
  if (existing) {
    console.log("Demo org already seeded, exiting.");
    return;
  }

  const org = await prisma.organization.create({
    data: { name: "Demo Trading Co (Staging)", slug: DEMO_SLUG },
  });

  const parties = await Promise.all(
    ["Sharma Textiles", "Gupta Hardware", "Verma Agencies", "Iyer Exports", "Khan Distributors"].map(
      (name, i) =>
        prisma.party.create({
          data: {
            organizationId: org.id,
            type: "CUSTOMER",
            name,
            email: `party${i + 1}@example.com`,
            phone: `+9198765000${i}0`,
            creditDays: 30,
          },
        }),
    ),
  );

  // 20 invoices: mix of PENDING / OVERDUE / PAID across aging buckets.
  for (let i = 0; i < 20; i++) {
    const party = parties[i % parties.length];
    const overdueDays = [-5, 10, 25, 45, 75, 120][i % 6]; // negative = not yet due
    const status = i % 4 === 0 ? "PAID" : overdueDays > 0 ? "OVERDUE" : "PENDING";
    const total = 10000 + i * 500;
    await prisma.invoice.create({
      data: {
        organizationId: org.id,
        partyId: party.id,
        clientName: party.name,
        clientEmail: party.email ?? `party${i + 1}@example.com`,
        invoiceNumber: `STG-${String(i + 1).padStart(3, "0")}`,
        type: "RECEIVABLE",
        status,
        amount: new Prisma.Decimal(total * 1.18),
        dueDate: daysFromNow(-overdueDays),
        subtotal: new Prisma.Decimal(total),
        taxAmount: new Prisma.Decimal(total * 0.18),
        totalAmount: new Prisma.Decimal(total * 1.18),
        amountPaid: status === "PAID" ? new Prisma.Decimal(total * 1.18) : new Prisma.Decimal(0),
        currency: "INR",
      },
    });
  }

  console.log(`Seeded org ${org.id}: ${parties.length} parties, 20 invoices.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
