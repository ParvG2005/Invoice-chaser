import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";
import { E2E_SEED } from "../prisma/seed-e2e";

/**
 * NOTE: like every other spec in this phase, this typechecks and has been
 * hand-traced against the built pages/routes, but is unexecuted end-to-end —
 * the Clerk e2e test user (E2E_CLERK_USER_EMAIL/PASSWORD) still doesn't exist
 * in this environment (Task 1 Step 8, still USER ACTION pending).
 *
 * Uses the real seed fixtures from `prisma/seed-e2e.ts` (E2E-INV-001/002/003),
 * not invented invoice numbers — E2E-INV-002 is the seeded OVERDUE invoice, so
 * it's the one expected to have scheduled reminders once a scan has run.
 */
test.describe("reminders", () => {
  test("sequence editor shows a step row with offset, tone, and channel switches", async ({ page }) => {
    await gotoScreen(page, "Reminders", /reminders/i);

    const row = page.getByTestId("sequence-step-row").first();
    await expect(row).toBeVisible();
    await expect(row.getByLabel(/offset/i)).toBeVisible();

    // Tone Select — Radix combobox trigger, options appear once opened.
    await row.getByRole("combobox").click();
    for (const label of ["Friendly", "Professional", "Firm", "Final notice"]) {
      await expect(page.getByRole("option", { name: label })).toBeVisible();
    }
    await page.keyboard.press("Escape");

    await expect(row.getByLabel("Email")).toBeVisible();
    await expect(row.getByLabel("WhatsApp")).toBeVisible();
  });

  test("WhatsApp switch is disabled with an 'Available after Phase 4' tooltip", async ({ page }) => {
    await gotoScreen(page, "Reminders", /reminders/i);

    const row = page.getByTestId("sequence-step-row").first();
    const whatsappSwitch = row.getByRole("switch", { name: "WhatsApp" });
    await expect(whatsappSwitch).toBeDisabled();

    await whatsappSwitch.hover();
    await expect(page.getByText("Available after Phase 4")).toBeVisible();
  });

  test("Add step appends a row; editing and saving persists across reload", async ({ page }) => {
    await gotoScreen(page, "Reminders", /reminders/i);

    const rowsBefore = await page.getByTestId("sequence-step-row").count();
    await page.getByRole("button", { name: "Add step" }).click();
    await expect(page.getByTestId("sequence-step-row")).toHaveCount(rowsBefore + 1);

    const newRow = page.getByTestId("sequence-step-row").last();
    await newRow.getByLabel(/offset/i).fill("21");
    await newRow.getByRole("combobox").click();
    await page.getByRole("option", { name: "Firm" }).click();

    await page.getByRole("button", { name: "Save sequence" }).click();
    await expect(page.getByText("Reminder settings saved")).toBeVisible(); // sonner toast

    await page.reload();
    const persistedRow = page.getByTestId("sequence-step-row").filter({ hasText: "21" });
    await expect(persistedRow).toBeVisible();
  });

  test("upcoming reminders queue lists scheduled reminders with row actions", async ({ page }) => {
    await gotoScreen(page, "Reminders", /reminders/i);

    // Trigger a scan first so the seeded OVERDUE invoice (E2E-INV-002) has a
    // scheduled reminder to show in the queue.
    await page.getByRole("button", { name: "Trigger scan now" }).click();
    await expect(page.getByText(/scan complete/i)).toBeVisible();

    await expect(page.getByRole("heading", { name: "Upcoming Reminders" })).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(E2E_SEED.invoiceNumbers[1]) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Send now" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Snooze" })).toBeVisible();
  });

  test("Send now confirms and triggers the email send", async ({ page }) => {
    await gotoScreen(page, "Reminders", /reminders/i);
    await page.getByRole("button", { name: "Trigger scan now" }).click();
    await expect(page.getByText(/scan complete/i)).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(E2E_SEED.invoiceNumbers[1]) });
    await row.getByRole("button", { name: "Send now" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Send now" }).click();

    await expect(page.getByText("Reminder sent")).toBeVisible(); // sonner toast
  });

  test("invoice detail has a Reminders tab with per-step skip toggles", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("link", { name: E2E_SEED.invoiceNumbers[1] }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/[a-z0-9-]+/);

    await page.getByRole("tab", { name: "Reminders" }).click();
    const scheduleRow = page.locator("text=Day").first();
    await expect(scheduleRow).toBeVisible();

    const skipSwitch = page.getByRole("switch", { name: /skip reminder/i }).first();
    await skipSwitch.click();
    await expect(page.getByText("Reminder schedule updated")).toBeVisible(); // sonner toast
  });
});
