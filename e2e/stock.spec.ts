import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";

async function gotoItemDetail(page: import("@playwright/test").Page, itemName: string) {
  await gotoScreen(page, "Stock", /stock/i);
  await page.getByRole("link", { name: itemName }).click();
  await expect(page).toHaveURL(/\/dashboard\/stock\/[a-z0-9-]+/);
}

test.describe("stock", () => {
  test("items table shows the seeded item with stock on hand and unit", async ({ page }) => {
    await gotoScreen(page, "Stock", /stock/i);
    const row = page.getByRole("row", { name: /Steel Rod 12mm/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText("50");
    await expect(row).toContainText("NOS");
  });

  test("Low stock only toggle hides and restores the seeded item", async ({ page }) => {
    await gotoScreen(page, "Stock", /stock/i);
    await expect(page.getByRole("row", { name: /Steel Rod 12mm/ })).toBeVisible();

    await page.getByRole("switch", { name: /low stock only/i }).click();
    await expect(page.getByRole("row", { name: /Steel Rod 12mm/ })).toHaveCount(0);

    await page.getByRole("switch", { name: /low stock only/i }).click();
    await expect(page.getByRole("row", { name: /Steel Rod 12mm/ })).toBeVisible();
  });

  test("item detail shows heading and movements table with the opening row", async ({ page }) => {
    await gotoItemDetail(page, "Steel Rod 12mm");
    await expect(page.getByRole("heading", { name: "Steel Rod 12mm" })).toBeVisible();

    const movements = page.getByTestId("movement-table");
    await expect(movements).toBeVisible();
    const firstRow = movements.getByRole("row").nth(1); // nth(0) is the header row
    await expect(firstRow).toContainText("Opening");
    await expect(firstRow).toContainText("50");
  });

  test("Adjust stock dialog records an adjustment and updates stock on hand", async ({ page }) => {
    await gotoItemDetail(page, "Steel Rod 12mm");

    await page.getByRole("button", { name: "Adjust stock" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Quantity").fill("-5");
    await dialog.getByLabel("Reason").fill("damaged");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Stock adjusted")).toBeVisible(); // sonner toast
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const movements = page.getByTestId("movement-table");
    const adjustmentRow = movements.getByRole("row", { name: /Adjustment/ });
    await expect(adjustmentRow).toBeVisible();
    await expect(adjustmentRow).toContainText("-5");

    await expect(page.getByTestId("item-stock-on-hand")).toContainText("45");
  });

  test("New item dialog creates an item and it appears in the table", async ({ page }) => {
    await gotoScreen(page, "Stock", /stock/i);
    await page.getByRole("button", { name: "New item" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name").fill("Test Widget");
    await dialog.getByLabel("Unit").fill("NOS");
    await dialog.getByLabel("Sale price").fill("100");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Item created")).toBeVisible(); // sonner toast
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(page.getByRole("row", { name: /Test Widget/ })).toBeVisible();
  });
});
