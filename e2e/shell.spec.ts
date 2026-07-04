import { test, expect } from "@playwright/test";

const NAV_LINKS = [
  "Dashboard",
  "Invoices",
  "Bills",
  "Parties",
  "Stock",
  "Payments",
  "Imports",
  "Reminders",
  "Settings",
];

test.describe("app shell", () => {
  test("sidebar shows all nav links", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop sidebar only; mobile nav is covered by its own test below");
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation");
    for (const name of NAV_LINKS) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
  });

  test("active link is highlighted", async ({ page }) => {
    await page.goto("/dashboard/invoices");
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Invoices" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("theme toggle switches dark class", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /toggle theme/i }).click();
    await page.getByRole("menuitem", { name: /dark/i }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("mobile shows hamburger nav", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile project only");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /open menu/i }).click();
    await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible();
  });
});
