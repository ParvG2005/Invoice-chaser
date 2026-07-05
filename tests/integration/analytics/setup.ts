process.env.TZ = "UTC"; // all fixture dates + bucket math are UTC

import { prisma } from "@/lib/db/prisma";
import { seedAnalyticsFixture } from "../../fixtures/analytics/seed";

export { prisma };

export async function resetAndSeed(): Promise<void> {
  // Same cascade-from-Organization convention as tests/integration/helpers/db.ts.
  await prisma.emailLog.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
  await seedAnalyticsFixture(prisma);
}
