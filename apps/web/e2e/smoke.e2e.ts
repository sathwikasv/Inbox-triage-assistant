import { expect, test, type Page } from "@playwright/test";

// The judged journey on the starter fixture: import → inbox → thread → edit draft → save → reload.
test.use({ viewport: { width: 1440, height: 900 } });

async function openComposer(page: Page) {
  const draft = page.getByLabel("Draft body");
  if (!(await draft.isVisible())) await page.locator("button[aria-expanded]", { hasText: /^(Reply|Acknowledgement)/ }).click();
  return draft;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Load starter fixture" }).click();
  await expect(page.getByText("starter fixture: labels applied")).toBeVisible();
});

test("import orders by time and reuses the run on re-import", async ({ page }) => {
  await expect(page.getByText("E10", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Load starter fixture" }).click();
  await expect(page.getByText("existing run reused")).toBeVisible();
});

test("inbox ranks escalations first; the thread shows the corrected deadline", async ({ page }) => {
  await page.getByRole("button", { name: /Open inbox/ }).click();
  await expect(page.getByRole("button", { name: /Escalations\s*2/ })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("Missing order IDs");
  await page.locator("tbody tr", { hasText: "Duplicate ticket creation" }).click();
  await expect(page.getByText("· Due 20 October 2026")).toBeVisible();
  await page.getByRole("tab", { name: /Copilot/ }).click();
  await page.getByRole("button", { name: "What changed?" }).click();
  await expect(page.getByText(/E02: correction \(due 20 October 2026, replaces E01\)/)).toBeVisible();
});

test("quarantine shows the unchanged policy and offers no reply", async ({ page }) => {
  await page.goto("/inbox/QUARANTINE");
  await expect(page.getByRole("alert")).toContainText("E05");
  await expect(page.getByRole("alert")).toContainText("auto_send: false");
  await expect(page.getByRole("button", { name: "Reply" })).toBeDisabled();
});

test("suggestions fix a draft; lint blocks the attachment claim; save survives reload", async ({ page }) => {
  await page.goto("/inbox/T-dup-ticket");
  const draft = await openComposer(page);
  await draft.fill("Hi,\n\nDev will fix it by 18 October.\n\nRegards");
  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(draft).toHaveValue(/20 October 2026/);

  await page.goto("/inbox/T-test-data");
  const ack = await openComposer(page);
  const save = page.getByRole("button", { name: "Save draft" });
  await ack.fill("Thanks, we have received the attached file.");
  await expect(page.getByText("claims an attachment")).toBeVisible();
  await expect(save).toBeDisabled();
  await ack.fill("Thanks for confirming the test data blocker is resolved. We have not verified the file you mentioned yet.");
  await save.click();
  await expect(page.getByText("edited", { exact: true }).first()).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: "Save reviewed result" }).click();
  await page.reload();
  await expect(page.getByText(/survives a reload/)).toBeVisible();
  await expect(page.getByText("edit draft").first()).toBeVisible();
});

test("an Approver signs off a draft; a Reviewer cannot", async ({ page }) => {
  await page.goto("/review");
  const row = page.locator("tr", { hasText: "Duplicate ticket creation" });
  await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();
  await page.goto("/settings");
  await page.getByRole("button", { name: /^Approver/ }).click();
  await page.goto("/review");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row.getByText("approved")).toBeVisible();
});

test("test-an-email quarantines a polite injection", async ({ page }) => {
  await page.goto("/playground");
  await page.getByRole("button", { name: "Polite injection" }).click();
  await page.getByRole("button", { name: "Analyze" }).click();
  await expect(page.getByRole("alert")).toContainText("Quarantined");
});

test("judge view shows 7/7 seeded items and all three checks passing", async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByText("recovered with their evidence")).toBeVisible();
  await expect(page.getByText("pass", { exact: true })).toHaveCount(3);
  await expect(page.locator("li", { hasText: "E02" }).first()).toBeVisible();
});
