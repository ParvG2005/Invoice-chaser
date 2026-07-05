import { prisma } from "../src/lib/db/prisma";
import { seedAnalyticsFixture, ORG_ID } from "../tests/fixtures/analytics/seed";

seedAnalyticsFixture(prisma)
  .then(() => console.log(`Seeded analytics fixture into org ${ORG_ID}`))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
