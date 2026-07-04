import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";
import { E2E_SEED } from "../prisma/seed-e2e";
import { prisma } from "../src/lib/db/prisma";

// invoice-detail.spec.ts's "mark paid flow" test marks E2E-INV-001 as PAID
// when the full suite runs before this file — reset it back to PENDING so
// this file's "open invoices" assumptions don't depend on run order.
test.describe("payments register", () => {
  test.beforeEach(async () => {
    await prisma.invoice.updateMany({
      where: { invoiceNumber: E2E_SEED.invoiceNumbers[0] },
      data: { status: "PENDING", amountPaid: 0 },
    });
  });

  test("shows the seeded ₹5,000 IN payment for Acme Traders, allocated", async ({ page }) => {
    await gotoScreen(page, "Payments", /payments/i);
    const row = page.getByRole("row", { name: /Acme Traders/ }).filter({ hasText: "₹5,000.00" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Allocated");
  });

  test("record payment: two-step allocate flow, partial allocation, and status update", async ({
    page,
  }) => {
    await gotoScreen(page, "Payments", /payments/i);
    await page.getByRole("button", { name: "Record payment" }).click();

    // Step 1: party / direction / amount / mode.
    await page.getByRole("button", { name: "Select party…" }).click();
    await page.getByRole("option", { name: "Acme Traders" }).click();
    await page.getByLabel("Direction").click();
    await page.getByRole("option", { name: "In" }).click();
    await page.getByLabel("Amount").fill("1000");
    await page.getByLabel("Mode").click();
    await page.getByRole("option", { name: "UPI" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2: open docs listed.
    await expect(page.getByText("E2E-INV-001", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E-INV-002", { exact: true })).toBeVisible();
    await expect(page.getByText(/Balance/).first()).toBeVisible();

    // Auto-allocate oldest first -> fills E2E-INV-002 (older due date) with 1000.00.
    await page.getByRole("button", { name: "Auto-allocate oldest first" }).click();
    const inv002Row = page.getByTestId(/allocation-row-/).filter({ hasText: "E2E-INV-002" });
    const inv002Input = inv002Row.getByRole("spinbutton");
    await expect(inv002Input).toHaveValue("1000.00");
    const unallocated = page.getByTestId("unallocated-amount");
    await expect(unallocated).toContainText("₹0.00");

    // Editing down to 600 leaves ₹400.00 unallocated; Save stays enabled.
    await inv002Input.fill("600");
    await expect(unallocated).toContainText("₹400.00");
    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page.getByText("Payment recorded")).toBeVisible(); // sonner toast
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Table gains the new row.
    const newRow = page.getByRole("row", { name: /Acme Traders/ }).filter({ hasText: "₹1,000.00" });
    await expect(newRow).toBeVisible();

    // E2E-INV-002 flips to PARTIALLY_PAID on the invoices list.
    await gotoScreen(page, "Invoices", /invoices/i);
    const invoiceRow = page.getByRole("row", { name: /E2E-INV-002/ });
    await expect(invoiceRow.locator('[data-status="PARTIALLY_PAID"]')).toBeVisible();
  });

  test("deep link opens the sheet pre-filled with the invoice's party and focused row", async ({
    page,
  }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("link", { name: "E2E-INV-001", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/([a-z0-9-]+)/);
    const invoiceId = page.url().match(/\/dashboard\/invoices\/([a-z0-9-]+)/)?.[1];
    expect(invoiceId).toBeTruthy();

    await page.goto(`/dashboard/payments?record=1&invoiceId=${invoiceId}`);

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Acme Traders");

    const focusedRow = page.getByTestId(`allocation-row-${invoiceId}`);
    await expect(focusedRow).toBeVisible();
    await expect(focusedRow.getByRole("spinbutton")).toBeFocused();
  });
});
