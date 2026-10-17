import { expect, test, type Page } from "@playwright/test";

// The AI assistant and review notifications. The server is mocked here, so these run without a model key;
// the server's own checks are covered by apps/api/tests/assist.test.ts.
test.use({ viewport: { width: 1440, height: 900 } });

const API = "http://assistant.test";

async function setup(page: Page, opts: { model: boolean; enabled: boolean; assist?: (subject: string) => object }) {
  const calls: string[] = [];
  await page.route(`${API}/**`, async (route) => {
    const url = new URL(route.request().url());
    calls.push(`${route.request().method()} ${url.pathname}`);
    if (url.pathname === "/ai/status") return route.fulfill({ json: { enabled: opts.model, model: opts.model ? "gemini-test" : null } });
    if (url.pathname === "/ai/assist" && opts.assist) {
      const body = route.request().postDataJSON() as { subject: string };
      return route.fulfill({ json: { status: "ok", model: "gemini-test", ...opts.assist(body.subject) } });
    }
    return route.fulfill({ status: 404, json: { error: "not mocked" } });
  });
  await page.goto("/dashboard");
  await page.evaluate(
    ({ api, enabled }) => {
      localStorage.clear();
      localStorage.setItem("c16.api_url", api);
      localStorage.setItem("c16.demo", "true"); // keep the labelled demo mailboxes for this test
      localStorage.setItem("c16.ai.enabled", JSON.stringify(enabled));
    },
    { api: API, enabled: opts.enabled },
  );
  await page.reload();
  return calls;
}

const rentDraft = (subject: string) =>
  subject === "Rent agreement renewal"
    ? {
        summary: "Amit asks whether you want to renew the rent agreement for another year.",
        key_points: ["Renewal for one more year"],
        needs_reply: true,
        reply: "Hi Amit,\n\nThanks for checking. Yes, I would like to renew the rent agreement for another year.\n\nRiya",
        reply_status: "ok",
        review: { needed: true, reasons: [{ text: "It is a decision about a legal agreement", source: "ai" }] },
      }
    : { summary: `Summary of ${subject}.`, key_points: [], needs_reply: false, reply: null, reply_status: "none", review: { needed: false, reasons: [] } };

test("with the assistant on, the open conversation gets a summary, a checked draft and review flags; nothing is sent", async ({ page }) => {
  const calls = await setup(page, { model: true, enabled: true, assist: rentDraft });
  await page.goto("/inbox");
  await page.locator("ul li button", { hasText: "Rent agreement renewal" }).first().click();
  await expect(page.getByText("Amit asks whether you want to renew the rent agreement for another year.")).toBeVisible();
  await expect(page.getByText("It is a decision about a legal agreement")).toBeVisible();
  await expect(page.getByText("AI draft · gemini-test")).toBeVisible();
  await expect(page.getByLabel("Reply body")).toHaveValue(/Yes, I would like to renew the rent agreement/);
  await expect(page.getByText("A reply draft is ready below.")).toBeVisible();
  await expect(page.getByText("sent (demo)")).toHaveCount(0);
  expect(calls.filter((c) => /send|reply$/.test(c))).toEqual([]);
});

test("a withheld AI draft is not offered; the template stays", async ({ page }) => {
  await setup(page, {
    model: true,
    enabled: true,
    assist: () => ({ summary: "Amit asks about the renewal.", key_points: [], needs_reply: true, reply: null, reply_status: "rejected", review: { needed: true, reasons: [{ text: "The AI draft made claims the conversation does not support, so it is not offered. Write this reply yourself.", source: "rules" }] } }),
  });
  await page.goto("/inbox");
  await page.locator("ul li button", { hasText: "Rent agreement renewal" }).first().click();
  await expect(page.getByText("The AI's draft was withheld")).toBeVisible();
  await expect(page.getByText("suggested draft")).toBeVisible();
  await expect(page.getByText(/AI draft ·/)).toHaveCount(0);
});

test("without a model key the assistant says so and the rules still flag what needs review", async ({ page }) => {
  await setup(page, { model: false, enabled: false });
  await page.goto("/settings?s=assistant");
  await expect(page.getByText(/No GEMINI_API_KEY on the server/)).toBeVisible();
  await expect(page.getByLabel(/Let the assistant read conversations/)).toBeDisabled();
  await page.getByRole("button", { name: /Needs your review/ }).click();
  await page.getByRole("menuitem", { name: /Meeting clash: Quick sync on the pilot/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Quick sync on the pilot" })).toBeVisible();
});

test("the Needs review folder collects flagged conversations", async ({ page }) => {
  await page.goto("/dashboard");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto("/inbox?view=review");
  await expect(page.locator("li[data-thread]", { hasText: "Quick sync on the pilot" })).toBeVisible();
  await expect(page.locator("li[data-thread]", { hasText: "Store handover checklist" })).toBeVisible();
  await expect(page.locator("li[data-thread]", { hasText: "Big Fashion Sale" })).toHaveCount(0);
});
