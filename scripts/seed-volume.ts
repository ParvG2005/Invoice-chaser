/**
 * Volume seed: 1 throwaway org, 1,000 parties, 10,000 invoices, for load
 * sanity checks (see scripts/explain-checks.ts). Staging/local DB only —
 * re-runnable, wipes and recreates only the volume org.
 *
 * Run: SEED_ALLOW=staging npm run seed:volume
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../src/lib/db/prisma";

const VOLUME_SLUG = "volume-test-org";
const PARTIES = 1_000;
const INVOICES = 10_000;

async function main() {
  if (process.env.SEED_ALLOW !== "staging") {
    throw new Error("Refusing to run: set SEED_ALLOW=staging explicitly.");
  }

  const old = await prisma.organization.findFirst({ where: { slug: VOLUME_SLUG } });
  if (old) {
    await prisma.invoice.deleteMany({ where: { organizationId: old.id } });
    await prisma.party.deleteMany({ where: { organizationId: old.id } });
    await prisma.organization.delete({ where: { id: old.id } });
  }
  const org = await prisma.organization.create({
    data: { name: "Volume Test Org", slug: VOLUME_SLUG },
  });

  const partyRows = Array.from({ length: PARTIES }, (_, i) => ({
    organizationId: org.id,
    type: "CUSTOMER" as const,
    name: `Volume Party ${String(i).padStart(4, "0")}`,
    email: `vp${i}@example.com`,
    creditDays: 30,
  }));
  for (let i = 0; i < partyRows.length; i += 1000) {
    await prisma.party.createMany({ data: partyRows.slice(i, i + 1000) });
  }
  const parties = await prisma.party.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true, email: true },
  });

  const now = Date.now();
  const invoiceRows = Array.from({ length: INVOICES }, (_, i) => {
    const dueOffsetDays = (i % 240) - 60; // due dates spread -60..+180 days
    const status = i % 3 === 0 ? "PAID" : dueOffsetDays < 0 ? "OVERDUE" : "PENDING";
    const total = 1000 + (i % 5000);
    const party = parties[i % PARTIES];
    return {
      organizationId: org.id,
      partyId: party.id,
      clientName: party.name,
      clientEmail: party.email ?? `vp${i % PARTIES}@example.com`,
      invoiceNumber: `VOL-${String(i).padStart(5, "0")}`,
      type: "RECEIVABLE" as const,
      status: status as "PAID" | "OVERDUE" | "PENDING",
      amount: new Prisma.Decimal(total * 1.18),
      dueDate: new Date(now - dueOffsetDays * 86_400_000),
      subtotal: new Prisma.Decimal(total),
      taxAmount: new Prisma.Decimal(total * 0.18),
      totalAmount: new Prisma.Decimal(total * 1.18),
      amountPaid: status === "PAID" ? new Prisma.Decimal(total * 1.18) : new Prisma.Decimal(0),
      currency: "INR",
    };
  });
  for (let i = 0; i < invoiceRows.length; i += 1000) {
    await prisma.invoice.createMany({ data: invoiceRows.slice(i, i + 1000) });
    console.log(`invoices: ${Math.min(i + 1000, INVOICES)}/${INVOICES}`);
  }
  console.log(`Done. org=${org.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
