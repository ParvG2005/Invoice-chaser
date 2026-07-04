import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";

test.describe("invoice editor", () => {
  test("create flow: party + line items + save", async ({ page }) => {
    await page.goto("/dashboard/invoices/new");
    await expect(page.getByRole("heading", { name: "New invoice" })).toBeVisible();

    // Party combobox: typing "Acme" surfaces "Acme Traders"; selecting fills the field.
    await page.getByRole("button", { name: "Select party…" }).click();
    await page.getByPlaceholder("Search parties…").fill("Acme");
    await page.getByRole("option", { name: "Acme Traders" }).click();
    await expect(page.getByRole("button", { name: "Acme Traders" })).toBeVisible();

    // Add line" appends a row.
    await page.getByRole("button", { name: "Add line" }).click();
    const row = page.getByTestId("line-item-row").first();
    await expect(row).toBeVisible();

    // The item picker on that row, given "Steel", offers "Steel Rod 12mm" with its stock badge.
    await row.getByRole("button", { name: "Pick item…" }).click();
    await page.getByPlaceholder("Search items…").fill("Steel");
    const option = page.getByRole("option", { name: /Steel Rod 12mm/ });
    await expect(option).toBeVisible();
    await expect(option.getByText("50", { exact: true })).toBeVisible();
    await option.click();

    // Selecting fills description/rate/tax on that row.
    await expect(row.getByLabel("Description")).toHaveValue("Steel Rod 12mm");
    await expect(row.getByLabel("Rate")).toHaveValue("500");

    // Seed item has no gstRate, so tax defaults to 0 — set a rate so the
    // totals footer's tax > 0 assertion below is meaningful.
    await row.getByLabel("Tax %").fill("18");

    // Setting qty updates the row amount and the totals footer.
    await row.getByLabel("Qty").fill("2");
    await expect(row.getByTestId("line-item-amount")).toContainText("₹");

    const subtotal = page.getByTestId("totals-subtotal");
    const taxTotal = page.getByTestId("totals-tax");
    const total = page.getByTestId("totals-total");
    await expect(subtotal).toContainText("₹");
    await expect(taxTotal).toContainText("₹");
    await expect(total).toContainText("₹");

    const subtotalText = (await subtotal.textContent()) ?? "";
    const totalText = (await total.textContent()) ?? "";
    const subtotalValue = Number(subtotalText.replace(/[^0-9.]/g, ""));
    const totalValue = Number(totalText.replace(/[^0-9.]/g, ""));
    expect(totalValue).toBeGreaterThan(subtotalValue);

    // Removing the row updates totals back to ₹0.00.
    await row.getByLabel("Remove line").click();
    await expect(page.getByTestId("line-item-row")).toHaveCount(0);
    await expect(total).toContainText("₹0.00");

    // Re-adding a line and clicking Save POSTs and redirects to the new invoice's detail page.
    await page.getByRole("button", { name: "Add line" }).click();
    const secondRow = page.getByTestId("line-item-row").first();
    await secondRow.getByRole("button", { name: "Pick item…" }).click();
    await page.getByPlaceholder("Search items…").fill("Steel");
    await page.getByRole("option", { name: /Steel Rod 12mm/ }).click();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/[a-z0-9-]+$/);
    await expect(page.getByText("Invoice created")).toBeVisible(); // sonner toast
  });

  test("edit flow: seeded invoice loads with its existing line item", async ({ page }) => {
    await gotoScreen(page, "Invoices", /invoices/i);
    await page.getByRole("link", { name: "E2E-INV-001" }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/[a-z0-9-]+$/);

    const url = page.url();
    await page.goto(`${url}/edit`);

    await expect(page.getByRole("heading", { name: "Edit invoice" })).toBeVisible();
    await expect(page.getByTestId("line-item-row")).toHaveCount(1);
    await expect(page.getByTestId("line-item-row").getByLabel("Description")).toHaveValue(
      "Steel Rod 12mm",
    );

    const saveButton = page.getByRole("button", { name: "Save changes" });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
  });
});
