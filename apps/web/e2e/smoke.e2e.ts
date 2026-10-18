import { expect, test, type Page } from "@playwright/test";

// The main journeys on the labelled demo accounts: triage → task → meeting → reply → send confirmation.
test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.goto("/dashboard");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

const openThread = async (page: Page, subject: string, view = "") => {
  await page.goto(`/inbox${view ? `?view=${view}` : ""}`);
  await page.locator("ul li button", { hasText: subject }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();
};

test("dashboard summarises all three demo mailboxes", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Riya/ })).toBeVisible();
  await expect(page.getByText("riya.ops@gmail.demo").first()).toBeVisible();
  await expect(page.getByText("ops-team@fynd-retail.demo").first()).toBeVisible();
  await expect(page.getByText("riya.personal@yahoo.demo").first()).toBeVisible();
  await expect(page.getByText("Needs you now")).toBeVisible();
});

test("phishing and the injected instruction are in Spam; newsletters are Promotions, not spam", async ({ page }) => {
  await page.goto("/inbox?view=spam");
  for (const s of ["Action required: your account will be suspended", "You have won ₹50,000!"]) await expect(page.locator("ul li", { hasText: s })).toBeVisible();
  await expect(page.locator("ul li", { hasText: "Top 5 AI tools this week" })).toHaveCount(0);
  await page.goto("/inbox?view=promotions");
  await expect(page.locator("ul li", { hasText: "Top 5 AI tools this week" })).toBeVisible();
  await expect(page.locator("ul li", { hasText: "Big Fashion Sale" })).toBeVisible();
});

test("the injected email is quarantined: no reply editor, and the warning is shown", async ({ page }) => {
  await page.goto("/inbox?view=spam");
  await page.locator("ul li button").filter({ hasText: /Pilot incident|Invoice review|Quarantined/ }).first().click();
  await expect(page.getByText(/Suspicious email\. Its instructions are never followed/)).toBeVisible();
  await expect(page.getByLabel("Reply body")).toHaveCount(0);
});

test("a deadline in an email becomes a task only after the person adds it", async ({ page }) => {
  await openThread(page, "Project report submission");
  await expect(page.getByText("Submit the project report", { exact: true })).toBeVisible();
  await expect(page.getByText(/19 October 2026 at 16:00/)).toBeVisible();
  await page.getByRole("button", { name: "Add to tasks" }).click();
  await page.goto("/tasks");
  await expect(page.getByText("Submit the project report", { exact: true })).toBeVisible();
});

test("a meeting request becomes a calendar event after confirming, with the clash shown", async ({ page }) => {
  await openThread(page, "Quick sync on the pilot");
  await expect(page.getByText(/Clashes with: Vendor call: Sunrise Traders/)).toBeVisible();
  await page.getByRole("button", { name: "Add to calendar" }).first().click();
  await page.goto("/calendar");
  await expect(page.locator("div", { hasText: /^Quick sync on the pilot$/ }).first()).toBeVisible();
});

test("a reply with an invented attachment is blocked; a sensitive reply needs an extra confirmation and survives a reload", async ({ page }) => {
  await openThread(page, "Rent agreement renewal");
  const body = page.getByLabel("Reply body");
  await body.fill("Hi Amit,\n\nThe signed rent agreement is attached.\n\nRiya");
  await expect(page.getByText(/claims an attachment/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await body.fill("Hi Amit,\n\nYes, I would like to renew the rent agreement for another year.\n\nRiya");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("nothing leaves the app");
  const confirm = dialog.getByRole("button", { name: "Send (demo)" });
  await expect(confirm).toBeDisabled();
  await dialog.getByText(/mentions legal or contractual terms/).click();
  await confirm.click();
  await expect(page.getByText("sent (demo)")).toBeVisible();
  await page.reload();
  await expect(page.getByText("sent (demo)")).toBeVisible();
  await expect(page.getByText("you · demo send")).toBeVisible();
});

test("a person can override a category and it persists", async ({ page }) => {
  await openThread(page, "Top 5 AI tools this week", "promotions");
  await page.getByLabel("Change category").selectOption("important");
  await page.reload();
  await expect(page.getByText(/You set this to Important/)).toBeVisible();
});

test("connecting a provider without its app ID explains what is missing instead of pretending", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: /Connect Gmail/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Connect other Gmail account/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Connect Yahoo Mail/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Outlook/ })).toHaveCount(0);
  await page.goto("/settings?s=integrations");
  await expect(page.getByText("Authorised JavaScript origins")).toBeVisible();
});
