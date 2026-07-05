import { test, expect } from "@playwright/test";

test.describe("analytics page", () => {
  test("renders headline tiles, charts, and tables", async ({ page }) => {
    await page.goto("/dashboard/analytics");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText("Money to come")).toBeVisible();
    await expect(page.getByText("Money to pay")).toBeVisible();
    await expect(page.getByText("Overdue value")).toBeVisible();
    await expect(page.getByText("Collected this month")).toBeVisible();
    await expect(page.getByText("Aging — receivables vs payables")).toBeVisible();
    await expect(page.getByText("Cash-flow projection (8 weeks)")).toBeVisible();
    await expect(page.getByText("Collection trend (6 months)")).toBeVisible();
    await expect(page.getByText("Party exposure & payment behavior")).toBeVisible();
    await expect(page.getByText("Agent leaderboard")).toBeVisible();
    // No client-side crash: at least one Recharts SVG rendered.
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
  });
});
