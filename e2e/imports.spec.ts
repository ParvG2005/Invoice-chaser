import path from "node:path";
import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";

// NOTE: like every other e2e spec added this phase, this file typechecks but is
// unexecuted end-to-end pending the Clerk e2e test user in this environment.
//
// Flow under test matches the REAL shipped API (Phase 2), not the retired
// master-plan assumption: POST /api/import/tally auto-enqueues and starts
// processing immediately (no separate multipart upload or /commit step).
// Status enum is PENDING|PROCESSING|COMPLETED|FAILED|REVERTED (no PREVIEW/RUNNING/DONE).

const LEDGERS_FIXTURE = path.join(__dirname, "fixtures/tally/masters-ledgers.xml");

test.describe("imports", () => {
  test("page shows heading, wizard entry point, and batch history region", async ({ page }) => {
    await gotoScreen(page, "Imports", /imports/i);
    await expect(page.getByRole("heading", { name: "Imports", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: /ledgers/i })).toBeVisible();
    await expect(page.getByRole("region", { name: /batch history/i })).toBeVisible();
  });

  test("uploading a ledgers XML file shows a preview before import starts", async ({ page }) => {
    await gotoScreen(page, "Imports", /imports/i);
    await page.getByRole("tab", { name: /ledgers/i }).click();

    await page.locator('input[type="file"]').setInputFiles(LEDGERS_FIXTURE);

    const preview = page.getByTestId("import-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(/\d+ records? parsed/i);

    // import has not started yet — no status/progress indicator, no count tiles
    await expect(page.getByTestId("import-status")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start import" })).toBeEnabled();
  });

  test("starting the import reaches a terminal status and shows four count tiles", async ({ page }) => {
    await gotoScreen(page, "Imports", /imports/i);
    await page.getByRole("tab", { name: /ledgers/i }).click();
    await page.locator('input[type="file"]').setInputFiles(LEDGERS_FIXTURE);
    await page.getByRole("button", { name: "Start import" }).click();

    const status = page.getByTestId("import-status");
    await expect(status).toBeVisible();
    await expect(status).toHaveText(/COMPLETED|FAILED/, { timeout: 15_000 });

    await expect(page.getByText(/^Created \d+/)).toBeVisible();
    await expect(page.getByText(/^Updated \d+/)).toBeVisible();
    await expect(page.getByText(/^Skipped \d+/)).toBeVisible();
    await expect(page.getByText(/^Errored \d+/)).toBeVisible();
  });

  test("Download report requests the batch report endpoint", async ({ page }) => {
    await gotoScreen(page, "Imports", /imports/i);
    await page.getByRole("tab", { name: /ledgers/i }).click();
    await page.locator('input[type="file"]').setInputFiles(LEDGERS_FIXTURE);
    await page.getByRole("button", { name: "Start import" }).click();
    await expect(page.getByTestId("import-status")).toHaveText(/COMPLETED|FAILED/, { timeout: 15_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download report" }).click(),
    ]);
    expect(download.url()).toMatch(/\/api\/import\/batches\/[^/]+\/report/);
  });

  test("batch history lists the batch with source label and counts, and undo reverts it", async ({ page }) => {
    await gotoScreen(page, "Imports", /imports/i);
    await page.getByRole("tab", { name: /ledgers/i }).click();
    await page.locator('input[type="file"]').setInputFiles(LEDGERS_FIXTURE);
    await page.getByRole("button", { name: "Start import" }).click();
    await expect(page.getByTestId("import-status")).toHaveText(/COMPLETED|FAILED/, { timeout: 15_000 });

    const history = page.getByRole("region", { name: /batch history/i });
    const row = history.getByRole("row", { name: /Ledgers/i }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/COMPLETED|FAILED/);

    await row.click();
    await row.getByRole("button", { name: "Undo" }).click();

    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Undo" }).click();

    await expect(page.getByText("Import batch reverted")).toBeVisible(); // sonner toast
    await expect(row).toContainText("REVERTED");
  });
});
