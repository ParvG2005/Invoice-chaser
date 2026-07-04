/**
 * Idempotent E2E seed data.
 *
 * Seeds a fixed, deterministic set of records into the organization owned by
 * the E2E Clerk test user (E2E_CLERK_USER_EMAIL). Every later Playwright
 * screen spec imports `E2E_SEED` from this file to assert against known
 * values, so the shape below must not change without updating every spec.
 *
 * Idempotent: safe to run repeatedly (upsert-by-unique-key, or
 * find-then-skip for entities without a natural unique key). Running twice
 * must not error or duplicate rows.
 *
 * Run: npm run db:seed:e2e
 */
import { prisma } from "../src/lib/db/prisma";
import { Prisma } from "../src/generated/prisma/client";

export const E2E_SEED = {
  partyName: "Acme Traders",
  agentName: "Ravi Kumar",
  supplierName: "Bharat Suppliers",
  itemName: "Steel Rod 12mm",
  invoiceNumbers: ["E2E-INV-001", "E2E-INV-002", "E2E-INV-003"],
  billNumber: "E2E-BILL-001",
} as const;

async function resolveOrganizationId(): Promise<string> {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) {
    throw new Error(
      "E2E_CLERK_USER_EMAIL is not set. Complete Task 1 Step 8 first: create the " +
        "Clerk test user, sign them in once so a User row is created, then set " +
        "E2E_CLERK_USER_EMAIL (and E2E_CLERK_USER_PASSWORD) in your environment."
    );
  }

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    throw new Error(
      `No User found for E2E_CLERK_USER_EMAIL="${email}". Complete Task 1 Step 8 first: ` +
        "create the Clerk test user and sign them in once (via the app) so their User " +
        "row is created via the Clerk webhook/sync."
    );
  }

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
  });
  if (!membership) {
    throw new Error(
      `User "${email}" exists but has no OrganizationMember. Complete Task 1 Step 8 ` +
        "first: ensure the e2e test user has an organization (sign-up / org creation flow)."
    );
  }

  return membership.organizationId;
}

async function main() {
  const organizationId = await resolveOrganizationId();

  // --- Cleanup: remove anything created by a test run (duplicate invoices,
  // "Test Co" party, "Test Widget" item, etc.) so every run starts from the
  // exact fixed seed set below. ---------------------------------------
  await prisma.invoice.deleteMany({
    where: { organizationId, invoiceNumber: { notIn: [...E2E_SEED.invoiceNumbers] } },
  });
  await prisma.item.deleteMany({
    where: { organizationId, name: { not: E2E_SEED.itemName } },
  });
  const extraParties = await prisma.party.findMany({
    where: {
      organizationId,
      name: { notIn: [E2E_SEED.partyName, E2E_SEED.agentName, E2E_SEED.supplierName] },
    },
    select: { id: true },
  });
  const extraPartyIds = extraParties.map((p) => p.id);
  if (extraPartyIds.length > 0) {
    await prisma.payment.deleteMany({ where: { organizationId, partyId: { in: extraPartyIds } } });
    await prisma.bill.deleteMany({ where: { organizationId, partyId: { in: extraPartyIds } } });
    await prisma.party.deleteMany({ where: { organizationId, id: { in: extraPartyIds } } });
  }
  await prisma.bill.deleteMany({
    where: { organizationId, billNumber: { not: E2E_SEED.billNumber } },
  });
  await prisma.importBatch.deleteMany({ where: { organizationId } });
  // Extra payments/allocations created by e2e mutation tests (e.g. the
  // "record payment" flow) — reset to nothing here; the one seeded ₹5,000
  // payment is recreated below.
  await prisma.paymentAllocation.deleteMany({ where: { organizationId } });
  await prisma.payment.deleteMany({ where: { organizationId } });
  // Reminders created by prior scans (each run's "Trigger scan now" /
  // "Send now" tests) — reset so the upcoming-queue tests see a clean slate.
  await prisma.reminder.deleteMany({ where: { organizationId } });

  // --- Parties -------------------------------------------------------
  // NOTE: upsert matches on [organizationId, name] regardless of deletedAt; if
  // this seed's rows are ever soft-deleted by other test cleanup, rerunning
  // this script will resurrect them via upsert rather than creating fresh rows.
  const agent = await prisma.party.upsert({
    where: { organizationId_name: { organizationId, name: E2E_SEED.agentName } },
    update: { email: "parvgoyal58@gmail.com" },
    create: {
      organizationId,
      type: "AGENT",
      name: E2E_SEED.agentName,
      email: "parvgoyal58@gmail.com",
    },
  });

  const customer = await prisma.party.upsert({
    where: { organizationId_name: { organizationId, name: E2E_SEED.partyName } },
    update: {
      agentId: agent.id,
      email: "parvgoyal58@gmail.com",
      phone: "+91-9876543210",
    },
    create: {
      organizationId,
      type: "CUSTOMER",
      name: E2E_SEED.partyName,
      email: "parvgoyal58@gmail.com",
      phone: "+91-9876543210",
      agentId: agent.id,
    },
  });

  const supplier = await prisma.party.upsert({
    where: { organizationId_name: { organizationId, name: E2E_SEED.supplierName } },
    update: { email: "parvgoyal58@gmail.com" },
    create: {
      organizationId,
      type: "SUPPLIER",
      name: E2E_SEED.supplierName,
      email: "parvgoyal58@gmail.com",
    },
  });

  // --- Item + opening stock -------------------------------------------
  // NOTE: upsert matches on [organizationId, name] regardless of deletedAt; if
  // this seed's row is ever soft-deleted by other test cleanup, rerunning this
  // script will resurrect it via upsert rather than creating a fresh row.
  const item = await prisma.item.upsert({
    where: { organizationId_name: { organizationId, name: E2E_SEED.itemName } },
    update: {
      unit: "NOS",
      reorderLevel: 10,
      openingQty: 50,
    },
    create: {
      organizationId,
      name: E2E_SEED.itemName,
      unit: "NOS",
      reorderLevel: 10,
      openingQty: 50,
      salePrice: 500,
    },
  });

  // Reset any non-opening movements left over from a previous run (e.g. an
  // "Adjust stock" test) so stock-on-hand is deterministic every run.
  await prisma.stockMovement.deleteMany({
    where: { organizationId, itemId: item.id, sourceType: { not: "OPENING" } },
  });

  const existingOpeningMovement = await prisma.stockMovement.findFirst({
    where: { organizationId, itemId: item.id, sourceType: "OPENING" },
  });
  if (!existingOpeningMovement) {
    await prisma.stockMovement.create({
      data: {
        organizationId,
        itemId: item.id,
        qty: 50,
        sourceType: "OPENING",
        movementDate: new Date(),
      },
    });
  }

  // --- Invoices ---------------------------------------------------------
  const today = new Date();
  const plusDays = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  };

  // E2E-INV-001: PENDING, due +14d, ₹10,000, one line item of the seeded item.
  const inv1 = await prisma.invoice.upsert({
    where: {
      organizationId_invoiceNumber: {
        organizationId,
        invoiceNumber: E2E_SEED.invoiceNumbers[0],
      },
    },
    update: {
      status: "PENDING",
      dueDate: plusDays(14),
      amount: 10000,
      subtotal: 10000,
      taxAmount: 0,
      totalAmount: 10000,
      amountPaid: 0,
      partyId: customer.id,
      clientEmail: customer.email ?? "parvgoyal58@gmail.com",
    },
    create: {
      organizationId,
      clientName: customer.name,
      clientEmail: customer.email ?? "parvgoyal58@gmail.com",
      invoiceNumber: E2E_SEED.invoiceNumbers[0],
      status: "PENDING",
      type: "RECEIVABLE",
      dueDate: plusDays(14),
      amount: 10000,
      subtotal: 10000,
      taxAmount: 0,
      totalAmount: 10000,
      amountPaid: 0,
      partyId: customer.id,
    },
  });

  const existingLineItem = await prisma.invoiceLineItem.findFirst({
    where: { organizationId, invoiceId: inv1.id, description: item.name },
  });
  if (!existingLineItem) {
    await prisma.invoiceLineItem.create({
      data: {
        organizationId,
        invoiceId: inv1.id,
        itemId: item.id,
        description: item.name,
        quantity: 20,
        rate: 500,
        discount: 0,
        taxRate: 0,
        amount: 10000,
        sortOrder: 0,
      },
    });
  }

  // E2E-INV-002: OVERDUE, due -30d, ₹18,500.
  await prisma.invoice.upsert({
    where: {
      organizationId_invoiceNumber: {
        organizationId,
        invoiceNumber: E2E_SEED.invoiceNumbers[1],
      },
    },
    update: {
      status: "OVERDUE",
      dueDate: plusDays(-30),
      amount: 18500.0,
      subtotal: 18500.0,
      taxAmount: 0,
      totalAmount: 18500.0,
      amountPaid: 0,
      partyId: customer.id,
      clientEmail: customer.email ?? "parvgoyal58@gmail.com",
    },
    create: {
      organizationId,
      clientName: customer.name,
      clientEmail: customer.email ?? "parvgoyal58@gmail.com",
      invoiceNumber: E2E_SEED.invoiceNumbers[1],
      status: "OVERDUE",
      type: "RECEIVABLE",
      dueDate: plusDays(-30),
      amount: 18500.0,
      subtotal: 18500.0,
      taxAmount: 0,
      totalAmount: 18500.0,
      amountPaid: 0,
      partyId: customer.id,
    },
  });

  // E2E-INV-003: PAID, ₹5,000, with a fully allocated IN payment.
  const inv3 = await prisma.invoice.upsert({
    where: {
      organizationId_invoiceNumber: {
        organizationId,
        invoiceNumber: E2E_SEED.invoiceNumbers[2],
      },
    },
    update: {
      status: "PAID",
      dueDate: plusDays(7),
      amount: 5000,
      subtotal: 5000,
      taxAmount: 0,
      totalAmount: 5000,
      amountPaid: 5000,
      partyId: customer.id,
      clientEmail: customer.email ?? "parvgoyal58@gmail.com",
    },
    create: {
      organizationId,
      clientName: customer.name,
      clientEmail: customer.email ?? "parvgoyal58@gmail.com",
      invoiceNumber: E2E_SEED.invoiceNumbers[2],
      status: "PAID",
      type: "RECEIVABLE",
      dueDate: plusDays(7),
      amount: 5000,
      subtotal: 5000,
      taxAmount: 0,
      totalAmount: 5000,
      amountPaid: 5000,
      partyId: customer.id,
    },
  });

  let payment = await prisma.payment.findFirst({
    where: {
      organizationId,
      partyId: customer.id,
      amount: 5000,
      direction: "IN",
    },
  });
  if (!payment) {
    payment = await prisma.payment.create({
      data: {
        organizationId,
        partyId: customer.id,
        direction: "IN",
        amount: 5000,
        unallocated: 0,
        mode: "BANK_TRANSFER",
        paymentDate: new Date(),
      },
    });
  }

  const existingAllocation = await prisma.paymentAllocation.findFirst({
    where: { organizationId, paymentId: payment.id, invoiceId: inv3.id },
  });
  if (!existingAllocation) {
    await prisma.paymentAllocation.create({
      data: {
        organizationId,
        paymentId: payment.id,
        invoiceId: inv3.id,
        amount: 5000,
      },
    });
  }

  // --- Bill --------------------------------------------------------------
  await prisma.bill.upsert({
    where: {
      organizationId_billNumber: {
        organizationId,
        billNumber: E2E_SEED.billNumber,
      },
    },
    update: {
      status: "PENDING",
      amount: 7250.0,
      amountPaid: 0,
      partyId: supplier.id,
      dueDate: plusDays(21),
    },
    create: {
      organizationId,
      partyId: supplier.id,
      billNumber: E2E_SEED.billNumber,
      billDate: today,
      dueDate: plusDays(21),
      amount: 7250.0,
      amountPaid: 0,
      status: "PENDING",
    },
  });

  // --- Reminder settings ---------------------------------------------
  // Explicit so specs don't depend on whatever autoSend value a previous
  // manual toggle left in the DB, and `sequence` is reset each run since
  // the "Add step" e2e test (and ad-hoc debugging) mutates/appends to it —
  // left unchecked it grows past the 10-item schema cap over repeated runs.
  await prisma.reminderSettings.upsert({
    where: { organizationId },
    update: { autoSend: true, sequence: Prisma.JsonNull },
    create: { organizationId, autoSend: true },
  });

  console.log(`E2E seed complete for organization ${organizationId}.`);
}

// Only reseed when this file is run directly (`npm run db:seed:e2e`), not when
// specs import `E2E_SEED` from it for fixture constants.
if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
