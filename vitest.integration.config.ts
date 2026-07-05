import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate config for the DB-backed integration suite (opt-in via
// `npm run test:integration`). The default vitest.config.ts excludes
// tests/integration/** entirely so the default `npm test` / CI `npm test`
// step stays DB-independent (CI runs `npm test` before `prisma migrate
// deploy`, see .github/workflows/ci.yml).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    clearMocks: true,
    // Analytics fixture files share fixed IDs (org-analytics-fixture) across
    // test files for hand-computed reconciliation — file-level parallelism
    // would race resetAndSeed() across workers against the same DB rows.
    fileParallelism: false,
  },
});
