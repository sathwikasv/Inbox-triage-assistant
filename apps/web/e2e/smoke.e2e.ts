import { expect, test } from "@playwright/test";

// The judged journey on the starter fixture: import → triage → thread → edit draft → save → reload.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByText("Load starter fixture").click();
  await expect(page.getByText("starter fixture: labels applied")).toBeVisible();
});

test("import orders by time and reuses the run on re-import", async ({ page }) => {
  await expect(page.getByText("E10 →")).toBeVisible();
  await page.getByText("Load starter fixture").click();
  await expect(page.getByText("existing run reused")).toBeVisible();
});

test("triage shows the correction, the escalation and the quarantine", async ({ page }) => {
  await page.getByRole("link", { name: "Open triage" }).click();
  await expect(page.getByRole("alert")).toContainText("E05");
  await expect(page.getByRole("alert")).toContainText("auto_send: false");
  await page.getByRole("link", { name: /Duplicate ticket creation/ }).click();
  await expect(page.getByText("20 October 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("superseded by E02")).toBeVisible();
});

test("lint blocks the attachment claim, a clean edit saves and survives reload", async ({ page }) => {
  await page.goto("/thread/T-test-data");
  const draft = page.getByLabel("Draft body");
  const save = page.getByRole("button", { name: "Save draft" });

  await draft.fill("Thanks, we have received the attached file.");
  await expect(page.getByText("claims an attachment")).toBeVisible();
  await expect(save).toBeDisabled();

  await draft.fill("Thanks for confirming the test data blocker is resolved. We have not verified the file you mentioned yet.");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("edited by reviewer").first()).toBeVisible();

  await page.locator("#E08").getByRole("button", { name: "Preview archive" }).click();
  await expect(page.locator("#E08")).toContainText("preview only, nothing changed");

  await page.goto("/review");
  await page.getByRole("button", { name: "Save reviewed result" }).click();
  await page.reload();
  await expect(page.getByText(/in this browser. Reload the page and it is still here/)).toBeVisible();
  await expect(page.locator("tbody")).toContainText("edit draft");
});

test("judge view shows 7/7 and all three checks passing", async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByText("7/7", { exact: true })).toBeVisible();
  await expect(page.getByText("pass", { exact: true })).toHaveCount(3);
});
