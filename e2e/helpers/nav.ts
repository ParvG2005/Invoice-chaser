import { Page, expect } from "@playwright/test";

/**
 * Navigate via the sidebar link and wait for the page heading. On mobile
 * viewports the nav lives inside a closed hamburger-menu Sheet (see
 * MobileNav) — open it first if its trigger is present, otherwise the desktop
 * sidebar's nav is already in the DOM.
 */
export async function gotoScreen(page: Page, linkName: string, heading: RegExp) {
  await page.goto("/dashboard");
  const menuTrigger = page.getByRole("button", { name: "Open menu" });
  if (await menuTrigger.isVisible().catch(() => false)) {
    await menuTrigger.click();
  }
  await page.getByRole("navigation").getByRole("link", { name: linkName }).click();
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
}
