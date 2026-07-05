import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";

/** Navigate to the invoices list and click into the row for `invoiceNumber`. */
async function gotoInvoiceDetail(page: import("@playwright/test").Page, invoiceNumber: string) {
  await gotoScreen(page, "Invoices", /invoices/i);
  await page.getByRole("link", { name: invoiceNumber }).click();
  await expect(page).toHaveURL(/\/dashboard\/invoices\/[a-z0-9]+/);
}

test.describe("invoice detail", () => {
  test("navigating from the list lands on the detail page @smoke", async ({ page }) => {
    await gotoInvoiceDetail(page, "E2E-INV-002");
    await expect(page.getByRole("heading", { name: "E2E-INV-002" })).toBeVisible();
  });

  test("header shows status, party link, and balance due", async ({ page }) => {
    await gotoInvoiceDetail(page, "E2E-INV-002");

    await expect(page.locator('[data-status="OVERDUE"]')).toBeVisible();

    const partyLink = page.getByRole("link", { name: "Acme Traders" });
    await expect(partyLink).toBeVisible();
    await expect(partyLink).toHaveAttribute("href", /\/dashboard\/parties\//);

    const balanceDue = page.getByTestId("balance-due");
    await expect(balanceDue).toContainText("Balance due");
    await expect(balanceDue).toContainText("₹");
  });

  test("all action buttons are visible", async ({ page }) => {
    await gotoInvoiceDetail(page, "E2E-INV-002");
    for (const label of [
      "Mark paid",
      "Record payment",
      "Send reminder now",
      "Snooze",
      "Duplicate",
      "Write off",
      "Download PDF",
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
  });

  test("line-items table shows the seeded line item", async ({ page }) => {
    await gotoInvoiceDetail(page, "E2E-INV-001");
    await expect(page.getByRole("row", { name: /Steel Rod 12mm/ })).toBeVisible();
  });

  test("timeline shows the seeded payment entry", async ({ page }) => {
    await gotoInvoiceDetail(page, "E2E-INV-003");
    const timeline = page.getByTestId("invoice-timeline");
    await expect(timeline).toBeVisible();
    await expect(timeline).toContainText(/payment .* ₹5,000/i);
  });

  test("mark paid flow updates the status chip", async ({ page }) => {
    await gotoInvoiceDetail(page, "E2E-INV-001");
    await page.getByRole("button", { name: "Mark paid" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Mark paid" }).click();
    await expect(page.locator('[data-status="PAID"]')).toBeVisible();
  });

  test("download pdf opens the print view in a popup", async ({ page }) => {
    await gotoInvoiceDetail(page, "E2E-INV-002");
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "Download PDF" }).click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toMatch(/\/print$/);
  });
});
