import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";
import { E2E_SEED } from "../prisma/seed-e2e";
import { prisma } from "../src/lib/db/prisma";

/**
 * Uses the real seed fixtures from `prisma/seed-e2e.ts` (E2E-INV-001/002/003),
 * not invented invoice numbers — E2E-INV-002 is the seeded OVERDUE invoice, so
 * it's the one expected to have scheduled reminders once a scan has run.
 *
 * The scan dedupes by (invoiceId, dayOffset) regardless of status, and
 * autoSend fires the job within seconds — so a test that triggers a scan
 * after an earlier test already did clears no fresh SCHEDULED row to act
 * on (dedup skips recreating it, and it may already be SENT). Clear
 * Reminder rows before each test so every scan starts from a clean slate.
 *
 * When the full suite runs, payments.spec.ts's "record payment" test
 * allocates against this same invoice, flipping it to PARTIALLY_PAID —
 * which the overdue-scan excludes entirely (scheduled: 0). Reset its
 * status/amountPaid here too so this file doesn't depend on run order.
 */
test.describe("reminders", () => {
  test.beforeEach(async () => {
    await prisma.reminder.deleteMany({ where: { invoice: { invoiceNumber: E2E_SEED.invoiceNumbers[1] } } });
    await prisma.invoice.updateMany({
      where: { invoiceNumber: E2E_SEED.invoiceNumbers[1] },
      data: { status: "OVERDUE", amountPaid: 0 },
    });
  });


  test("sequence editor shows a step row with offset, tone, and channel switches @smoke", async ({ page }) => {
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
    const persistedRow = page.getByTestId("sequence-step-row").last();
    await expect(persistedRow.getByLabel(/offset/i)).toHaveValue("21");
  });

  test("upcoming reminders queue lists scheduled reminders with row actions", async ({ page }) => {
    await gotoScreen(page, "Reminders", /reminders/i);

    // Trigger a scan first so the seeded OVERDUE invoice (E2E-INV-002) has a
    // scheduled reminder to show in the queue.
    await page.getByRole("button", { name: "Trigger scan now" }).click();
    await expect(page.getByText(/scan complete/i)).toBeVisible();

    await expect(page.getByRole("heading", { name: "Upcoming Reminders" })).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(E2E_SEED.invoiceNumbers[1]) }).first();
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Send now" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Snooze" })).toBeVisible();
  });

  test("Send now confirms and triggers the email send", async ({ page }) => {
    // Seed a SCHEDULED reminder directly instead of via "Trigger scan now" —
    // autoSend can process it (and the other offsets) before the test even
    // locates the row. This test is about the manual send action, not the
    // scan pipeline, so bypass that race.
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { invoiceNumber: E2E_SEED.invoiceNumbers[1], clientEmail: "parvgoyal58@gmail.com" },
    });
    await prisma.reminder.create({
      data: {
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        scheduledFor: new Date(),
        tone: "PROFESSIONAL",
        dayOffset: 14,
        status: "SCHEDULED",
      },
    });

    await gotoScreen(page, "Reminders", /reminders/i);

    const row = page.getByRole("row", { name: new RegExp(E2E_SEED.invoiceNumbers[1]) }).first();
    await row.getByRole("button", { name: "Send now" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Send now" }).click();

    // Whichever of the auto-send job (enqueued right after the scan) or this
    // manual click wins the atomic send-claim gets the actual send; the other
    // sees it as already handled. Both are a successful end-to-end outcome.
    // Generous timeout: this endpoint synchronously waits on AI email
    // generation + a real SMTP round-trip, which can take several seconds.
    await expect(
      page.getByText(/Reminder sent|Reminder was already sent/),
    ).toBeVisible({ timeout: 15_000 }); // sonner toast
  });

  test("invoice detail has a Reminders tab with per-step skip toggles", async ({ page }) => {
    // Seed a SCHEDULED reminder directly rather than via "Trigger scan now" —
    // that also enqueues an immediate auto-send, and autoSend fires fast
    // enough locally to flip it to SENT (permanently disabling its skip
    // switch) before the test can reach it. This test is about the toggle
    // UI/PATCH endpoint, not the scan/send pipeline, so bypass the race.
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { invoiceNumber: E2E_SEED.invoiceNumbers[1], clientEmail: "parvgoyal58@gmail.com" },
    });
    await prisma.reminder.create({
      data: {
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        scheduledFor: new Date(),
        tone: "PROFESSIONAL",
        dayOffset: 14,
        status: "SCHEDULED",
      },
    });

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
