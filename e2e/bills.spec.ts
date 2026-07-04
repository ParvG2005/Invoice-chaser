import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";

/** Navigate to the bills list and click into the row for `billNumber`. */
async function gotoBillDetail(page: import("@playwright/test").Page, billNumber: string) {
  await gotoScreen(page, "Bills", /bills/i);
  await page.getByRole("link", { name: billNumber }).click();
  await expect(page).toHaveURL(/\/dashboard\/bills\/[a-z0-9-]+/);
}

test.describe("bills list", () => {
  test("renders the seeded bill with supplier, status chip, and amount", async ({ page }) => {
    await gotoScreen(page, "Bills", /bills/i);
    const row = page.getByRole("row", { name: /E2E-BILL-001/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Bharat Suppliers");
    await expect(row.locator('[data-status="PENDING"]')).toBeVisible();
    await expect(row).toContainText("₹7,250");
  });

  test("Export CSV button triggers a download", async ({ page }) => {
    await gotoScreen(page, "Bills", /bills/i);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/bills.*\.csv/);
  });

  test("row action menu contains mark paid, record payment, and write off", async ({ page }) => {
    await gotoScreen(page, "Bills", /bills/i);
    await page
      .getByRole("row", { name: /E2E-BILL-001/ })
      .getByRole("button", { name: /actions/i })
      .click();
    for (const item of ["Mark paid", "Record payment", "Write off"]) {
      await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
    }
  });

  test("Record payment navigates to the payments deep link with the sheet open", async ({
    page,
  }) => {
    await gotoScreen(page, "Bills", /bills/i);
    await page
      .getByRole("row", { name: /E2E-BILL-001/ })
      .getByRole("button", { name: /actions/i })
      .click();
    await page.getByRole("menuitem", { name: "Record payment" }).click();

    await expect(page).toHaveURL(/\/dashboard\/payments\?record=1&direction=OUT&billId=/);
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Bharat Suppliers");
  });

  test("clicking the row opens the detail page", async ({ page }) => {
    await gotoBillDetail(page, "E2E-BILL-001");
    await expect(page.getByRole("heading", { name: "E2E-BILL-001" })).toBeVisible();

    const supplierLink = page.getByRole("link", { name: "Bharat Suppliers" });
    await expect(supplierLink).toBeVisible();
    await expect(supplierLink).toHaveAttribute("href", /\/dashboard\/parties\//);

    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();

    const payments = page.getByTestId("bill-payments");
    await expect(payments).toBeVisible();
    await expect(payments).toContainText("No payments yet");
  });

  test("New bill opens the form, filters the supplier picker, and creates a bill", async ({
    page,
  }) => {
    await gotoScreen(page, "Bills", /bills/i);
    await page.getByRole("button", { name: "New bill" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Select party…" }).click();
    await expect(page.getByRole("option", { name: "Bharat Suppliers" })).toBeVisible();
    // The invoices customer must not appear once filtered to suppliers.
    await expect(page.getByRole("option", { name: "Acme Traders" })).toHaveCount(0);
    await page.getByRole("option", { name: "Bharat Suppliers" }).click();

    await dialog.getByLabel("Amount").fill("1500");
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    await dialog.getByLabel("Due date").fill(dueDate.toISOString().slice(0, 10));

    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Bill created")).toBeVisible(); // sonner toast
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
