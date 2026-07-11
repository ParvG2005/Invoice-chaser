import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "global setup", testMatch: /global\.setup\.ts/ },
    {
      name: "auth setup",
      testMatch: /auth\.setup\.ts/,
      dependencies: ["global setup"],
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["auth setup"],
    },
    {
      name: "chromium-dark",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "dark",
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["auth setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: "e2e/.auth/user.json" },
      dependencies: ["auth setup"],
    },
  ],
  webServer: [
    {
      // App under test. INNGEST_DEV=1 forces the Inngest SDK into dev mode so
      // events are delivered by the local inngest-cli dev server below instead
      // of Inngest Cloud. This only affects the e2e-spawned dev server; it is
      // never set in production, so the cloud path is unaffected.
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        INNGEST_DEV: "1",
        // Locally, force the SMTP (nodemailer) email provider by unsetting the
        // Resend key: the dev Resend account is in test mode and 403s any
        // recipient other than the account owner, which would fail the
        // "Send now" reminder e2e. SMTP (the configured Gmail relay) delivers
        // to the seeded recipient without that restriction. Left untouched in
        // CI so the cloud path (Resend with a verified domain) is unaffected.
        ...(process.env.CI ? {} : { RESEND_API_KEY: "" }),
      },
    },
    {
      // Async worker: picks up events (Tally import, reminder sends) and runs
      // the Inngest functions registered at /api/inngest. Without it, jobs
      // enqueued during e2e never execute and invoices stay PENDING.
      command:
        "npx --yes inngest-cli@latest dev -u http://localhost:3000/api/inngest --no-discovery",
      url: "http://localhost:8288",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
