import { test, expect } from "@playwright/test";
import { gotoScreen } from "./helpers/nav";

/**
 * NOTE: like every other spec in this phase, this typechecks and has been
 * hand-traced against the built page/route, but is unexecuted end-to-end —
 * the Clerk e2e test user still doesn't exist in this environment (Task 1
 * Step 8, still USER ACTION pending).
 *
 * Scope decision (see task-26-report.md): the approved Stitch design shows a
 * "Reminder Defaults" section on Settings (tone + channel toggles, including
 * an SMS toggle that doesn't exist in this schema/product at all). Since the
 * Reminders page now owns the full sequence editor (superset of tone/channel
 * config) and duplicating tone/channel state across two pages would create
 * two sources of truth, "Reminder Defaults" was folded into the Reminders
 * page rather than also rendered here — so it is deliberately NOT asserted
 * as a Settings section below.
 */
test.describe("settings", () => {
  test("shows Organization, Sender identity, WhatsApp, and Appearance sections", async ({ page }) => {
    await gotoScreen(page, "Settings", /settings/i);

    for (const heading of ["Organization", "Sender identity", "WhatsApp", "Appearance", "Danger zone"]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
  });

  test("WhatsApp card shows 'Connects in Phase 4' status", async ({ page }) => {
    await gotoScreen(page, "Settings", /settings/i);
    await expect(page.getByText("Connects in Phase 4")).toBeVisible();
  });

  test("changing org name and saving persists across reload", async ({ page }) => {
    await gotoScreen(page, "Settings", /settings/i);

    const nameInput = page.getByLabel("Organization name");
    await nameInput.fill("Acme Renamed Co");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible(); // sonner toast

    await page.reload();
    await expect(page.getByLabel("Organization name")).toHaveValue("Acme Renamed Co");
  });

  test("theme selector changes and persists via the org theme field", async ({ page }) => {
    await gotoScreen(page, "Settings", /settings/i);

    await page.getByRole("combobox", { name: "Theme" }).click();
    await page.getByRole("option", { name: "Dark" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Theme" })).toContainText("Dark");
  });

  test("Danger zone shows a Delete organization button behind a confirm dialog", async ({ page }) => {
    await gotoScreen(page, "Settings", /settings/i);

    const deleteButton = page.getByRole("button", { name: "Delete organization" });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Confirm dialog (this codebase's shared destructive-action pattern —
    // src/components/shared/confirm-dialog.tsx), not an immediate delete.
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/delete this organization/i);
    // Deliberately do not confirm — this test only verifies the button is
    // gated behind a confirm, not the actual destructive flow.
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });
});
