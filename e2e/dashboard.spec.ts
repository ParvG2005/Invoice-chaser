import { test, expect } from "@playwright/test";

test.describe("dashboard", () => {
  test("headline tiles render with rupee values @smoke", async ({ page }) => {
    await page.goto("/dashboard");
    for (const tile of ["Money to come", "Money to pay", "Pending invoices", "Overdue"]) {
      const card = page.getByTestId(`tile-${tile.toLowerCase().replace(/ /g, "-")}`);
      await expect(card).toBeVisible();
      await expect(card).toContainText("₹");
    }
  });

  test("quick actions navigate", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "New invoice" }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/new/);
  });

  test("recent activity section renders", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /recent activity/i })).toBeVisible();
  });
});
