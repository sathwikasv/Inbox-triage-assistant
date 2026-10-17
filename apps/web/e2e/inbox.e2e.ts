import { expect, test } from "@playwright/test";

// Everyday inbox interactions on the labelled demo accounts: keyboard, bulk actions, search, filters, task board.
test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.goto("/dashboard");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("j and k move through the list; e archives, and Undo brings it back", async ({ page }) => {
  await page.goto("/inbox");
  await page.keyboard.press("j");
  const first = page.getByRole("heading", { level: 1 });
  await expect(first).toHaveText("Move the vendor review");
  await page.keyboard.press("j");
  await expect(first).toHaveText("Quick sync on the pilot");
  await page.keyboard.press("k");
  await expect(first).toHaveText("Move the vendor review");
  await page.keyboard.press("e");
  await expect(page.getByText("1 conversation archived")).toBeVisible();
  await expect(page.locator("ul li", { hasText: "Move the vendor review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("ul li", { hasText: "Move the vendor review" })).toHaveCount(1);
});

test("selecting two conversations and archiving them moves both to Archive", async ({ page }) => {
  await page.goto("/inbox?view=promotions");
  await page.getByLabel("Select all").check();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Archive" }).first().click();
  await expect(page.locator("li[data-thread]")).toHaveCount(0);
  await page.goto("/inbox?view=archive");
  await expect(page.locator("ul li", { hasText: "Top 5 AI tools this week" })).toBeVisible();
  await expect(page.locator("ul li", { hasText: "Big Fashion Sale" })).toBeVisible();
});

test("the header search filters every mailbox at once", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByLabel("Search mail").fill("rent agreement");
  await expect(page).toHaveURL(/\/inbox\?q=rent/);
  await expect(page.locator("li[data-thread]")).toHaveCount(1);
  await expect(page.locator("li[data-thread]", { hasText: "Rent agreement renewal" })).toBeVisible();
});

test("category chips filter the inbox and explain the category", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByRole("button", { name: /^Meetings \d+$/ }).click();
  await expect(page).toHaveURL(/view=meetings/);
  await expect(page.getByText("Meeting requests, invitations, reschedules and confirmations.")).toBeVisible();
  await expect(page.locator("ul li", { hasText: "Quick sync on the pilot" })).toBeVisible();
  await expect(page.locator("ul li", { hasText: "Big Fashion Sale" })).toHaveCount(0);
});

test("the assistant's evidence is highlighted in the email it came from", async ({ page }) => {
  await page.goto("/inbox");
  await page.locator("ul li button", { hasText: "Duplicate ticket creation" }).first().click();
  await expect(page.locator("mark", { hasText: "Correction: due 20 October." })).toBeVisible();
  await page.getByRole("button", { name: "Evidence highlighted" }).click();
  await expect(page.locator("mark")).toHaveCount(0);
});

test("a suggested task dragged onto In progress joins the list there", async ({ page }) => {
  await page.goto("/tasks");
  const card = page.locator("article", { hasText: "Submit the project report" });
  const column = page.locator("section", { has: page.getByRole("heading", { name: "In progress" }) });
  // drop near the top of the column so the page does not scroll mid-drag
  await card.dragTo(column, { sourcePosition: { x: 40, y: 20 }, targetPosition: { x: 60, y: 30 } });
  await expect(column.getByText("Submit the project report", { exact: true })).toBeVisible();
  await expect(column.getByLabel("Status")).toHaveValue("in_progress");
});
