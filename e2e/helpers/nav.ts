import { Page, expect } from "@playwright/test";

/** Navigate via the sidebar link and wait for the page heading. */
export async function gotoScreen(page: Page, linkName: string, heading: RegExp) {
  await page.goto("/dashboard");
  await page.getByRole("navigation").getByRole("link", { name: linkName }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}
