import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";

test.describe("invoices list", () => {
  test("renders seeded invoices with status chips", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    const row = page.getByRole("row", { name: /E2E-INV-002/ });
    await expect(row).toBeVisible();
    await expect(row.locator('[data-status="OVERDUE"]')).toBeVisible();
  });

  test("status filter narrows the table", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("button", { name: /^overdue$/i }).click();
    await expect(page.getByRole("row", { name: /E2E-INV-002/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /E2E-INV-003/ })).toHaveCount(0);
  });

  test("saved filter round-trips", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("button", { name: /^overdue$/i }).click();
    await page.getByRole("button", { name: /save filter/i }).click();
    await page.getByLabel(/filter name/i).fill("Chase these");
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.reload();
    await page.getByRole("tab", { name: "Chase these" }).click();
    await expect(page.getByRole("row", { name: /E2E-INV-002/ })).toBeVisible();
  });

  test("bulk select shows action bar", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("row", { name: /E2E-INV-001/ }).getByRole("checkbox").check();
    const bar = page.getByTestId("bulk-actions-bar");
    await expect(bar).toContainText("1 selected");
    for (const action of ["Send reminders", "Mark paid", "Export CSV", "Delete"]) {
      await expect(bar.getByRole("button", { name: action })).toBeVisible();
    }
  });

  test("row menu lists every mutation affordance", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("row", { name: /E2E-INV-001/ }).getByRole("button", { name: /actions/i }).click();
    for (const item of [
      "Mark paid",
      "Record partial payment",
      "Send reminder now",
      "Snooze",
      "Duplicate",
      "Write off",
      "Export PDF",
    ]) {
      await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
    }
  });

  test("duplicate creates a new invoice", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("row", { name: /E2E-INV-001/ }).getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(page.getByText(/invoice duplicated/i)).toBeVisible(); // sonner toast
  });
});
