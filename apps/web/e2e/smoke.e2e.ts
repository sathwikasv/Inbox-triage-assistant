import { expect, test } from "@playwright/test";

// The judged journey on the starter fixture: import → inbox → thread → edit draft → save → reload.
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

test("inbox ranks escalations first and shows the corrected deadline", async ({ page }) => {
  await page.getByRole("link", { name: "Open inbox" }).click();
  await expect(page.getByRole("button", { name: /Escalations\s*2/ })).toBeVisible();
  await page.getByRole("option").filter({ hasText: "Duplicate ticket creation" }).getByRole("button").click();
  await expect(page.getByText("20 October 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("corrected; the latest date wins")).toBeVisible();
  await page.getByRole("button", { name: "What changed?" }).click();
  await expect(page.getByText(/E02: correction \(due 20 October 2026, replaces E01\)/)).toBeVisible();
});

test("quarantine shows the unchanged policy and cannot be archived", async ({ page }) => {
  await page.goto("/inbox/QUARANTINE");
  await expect(page.getByRole("alert")).toContainText("E05");
  await expect(page.getByRole("alert")).toContainText("auto_send: false");
  await expect(page.getByRole("button", { name: /^Archive/ })).toBeDisabled();
});

test("suggestions fix a draft; lint blocks the attachment claim; save survives reload", async ({ page }) => {
  await page.goto("/inbox/T-dup-ticket");
  const draft = page.getByLabel("Draft body");
  await draft.fill("Hi,\n\nDev will fix it by 18 October.\n\nRegards");
  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(draft).toHaveValue(/20 October 2026/);

  await page.goto("/inbox/T-test-data");
  const save = page.getByRole("button", { name: "Save draft" });
  await page.getByLabel("Draft body").fill("Thanks, we have received the attached file.");
  await expect(page.getByText("claims an attachment")).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByLabel("Draft body").fill("Thanks for confirming the test data blocker is resolved. We have not verified the file you mentioned yet.");
  await save.click();
  await expect(page.getByText("edited by reviewer").first()).toBeVisible();

  await page.locator("#E08").getByRole("button", { name: "Preview archive" }).click();
  await expect(page.locator("#E08")).toContainText("preview only, nothing changed");

  await page.goto("/review");
  await page.getByRole("button", { name: "Save reviewed result" }).click();
  await page.reload();
  await expect(page.getByText(/in this browser\. Reload the page and it is still here/)).toBeVisible();
  await expect(page.locator("tbody")).toContainText("edit draft");
});

test("test-an-email quarantines a polite injection", async ({ page }) => {
  await page.goto("/try");
  await page.getByRole("button", { name: "Polite injection" }).click();
  await page.getByRole("button", { name: "Analyze" }).click();
  await expect(page.getByRole("alert")).toContainText("Quarantined");
});

test("judge view shows 7/7 and all three checks passing", async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByText("7/7", { exact: true })).toBeVisible();
  await expect(page.getByText("pass", { exact: true })).toHaveCount(3);
});
