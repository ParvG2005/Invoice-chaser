import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";

test.describe("parties directory", () => {
  test("lists seeded parties with type badges and agent cell", async ({ page }) => {
    await gotoScreen(page, "Parties", /parties/i);

    const acme = page.getByRole("row", { name: /Acme Traders/ });
    await expect(acme).toBeVisible();
    await expect(acme).toContainText("Customer");
    await expect(acme).toContainText("Ravi Kumar");

    const supplier = page.getByRole("row", { name: /Bharat Suppliers/ });
    await expect(supplier).toBeVisible();
    await expect(supplier).toContainText("Supplier");

    // "Ravi Kumar" also appears in Acme Traders' agent cell, so scope by the
    // row whose *name* link (not agent cell) is exactly "Ravi Kumar".
    const agent = page
      .getByRole("row")
      .filter({ has: page.getByRole("link", { name: "Ravi Kumar", exact: true }) });
    await expect(agent).toBeVisible();
    await expect(agent).toContainText("Agent");
  });

  test("type filter tab narrows the table", async ({ page }) => {
    await gotoScreen(page, "Parties", /parties/i);
    await page.getByRole("tab", { name: "Customers" }).click();
    await expect(page.getByRole("row", { name: /Acme Traders/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Bharat Suppliers/ })).toHaveCount(0);
  });

  test("new party dialog creates a party", async ({ page }) => {
    await gotoScreen(page, "Parties", /parties/i);
    await page.getByRole("button", { name: "New party" }).click();
    await page.getByLabel("Name").fill("Test Co");
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Customer" }).click();
    await page.getByRole("button", { name: "Create party" }).click();

    await expect(page.getByText("Party created")).toBeVisible(); // sonner toast
    await expect(page.getByRole("row", { name: /Test Co/ })).toBeVisible();
  });

  test("clicking into Acme Traders shows the ledger", async ({ page }) => {
    await gotoScreen(page, "Parties", /parties/i);
    await page.getByRole("link", { name: "Acme Traders" }).click();
    await expect(page).toHaveURL(/\/dashboard\/parties\/[a-z0-9-]+/);
    await expect(page.getByRole("heading", { name: "Acme Traders" })).toBeVisible();
    await expect(page.getByText("billing@acmetraders.example")).toBeVisible();

    const ledger = page.getByTestId("party-ledger");
    await expect(ledger).toBeVisible();
    const rows = ledger.getByRole("row");
    // header row + at least 3 data rows
    await expect(rows).toHaveCount(await rows.count());
    expect(await rows.count()).toBeGreaterThanOrEqual(4);

    const lastRow = rows.last();
    await expect(lastRow).toContainText("₹");
  });

  test("download statement menu offers CSV and PDF", async ({ page }) => {
    await gotoScreen(page, "Parties", /parties/i);
    await page.getByRole("link", { name: "Acme Traders" }).click();
    await page.getByRole("button", { name: "Download statement" }).click();
    await expect(page.getByRole("menuitem", { name: "CSV" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "PDF" })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/statement-.*\.csv/);
  });

  test("agent detail page shows managed parties rollup", async ({ page }) => {
    await gotoScreen(page, "Parties", /parties/i);
    await page.getByRole("link", { name: "Ravi Kumar" }).click();
    await expect(page.getByRole("heading", { name: "Managed parties" })).toBeVisible();
    const row = page.getByRole("row", { name: /Acme Traders/ });
    await expect(row).toBeVisible();
    const totalRow = page.getByRole("row", { name: /total outstanding/i });
    await expect(totalRow).toContainText("₹");
  });
});
