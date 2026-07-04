/**
 * Backfill: distinct Invoice.clientName/clientEmail/clientPhone → Party rows,
 * then link Invoice.partyId. Idempotent: only processes invoices with
 * partyId = null; reuses an existing Party when one matches by name.
 *
 * Run: npm run db:backfill-parties   (uses DATABASE_URL from .env)
 */
import { prisma } from "../src/lib/db/prisma";
import { groupInvoicesForBackfill } from "../src/lib/import/party-backfill";

async function main() {
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  let totalParties = 0;
  let totalLinked = 0;

  for (const org of orgs) {
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: org.id, deletedAt: null, partyId: null },
      select: { id: true, clientName: true, clientEmail: true, clientPhone: true },
    });
    if (invoices.length === 0) continue;

    const seeds = groupInvoicesForBackfill(invoices);

    for (const seed of seeds) {
      const linked = await prisma.$transaction(async (tx) => {
        // Match by normalized name against existing (incl. previously backfilled) parties.
        const existing = await tx.party.findFirst({
          where: {
            organizationId: org.id,
            deletedAt: null,
            name: { equals: seed.name, mode: "insensitive" },
          },
        });

        const party =
          existing ??
          (await tx.party.create({
            data: {
              organizationId: org.id,
              type: "CUSTOMER",
              name: seed.name,
              email: seed.email,
              phone: seed.phone,
            },
          }));

        if (!existing) totalParties++;

        const result = await tx.invoice.updateMany({
          where: { id: { in: seed.invoiceIds }, organizationId: org.id, partyId: null },
          data: { partyId: party.id },
        });
        return result.count;
      });
      totalLinked += linked;
    }
    console.log(`[${org.name}] processed ${invoices.length} invoices, ${seeds.length} parties`);
  }

  const remaining = await prisma.invoice.count({
    where: { deletedAt: null, partyId: null, clientName: { not: "" } },
  });
  console.log(`Done. Created ${totalParties} parties, linked ${totalLinked} invoices.`);
  console.log(`Invoices still unlinked (blank client name expected only): ${remaining}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
