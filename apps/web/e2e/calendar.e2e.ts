import { expect, test, type Page } from "@playwright/test";

// Times from other zones shown in the reader's own zone (IST), the Calendar grid, and Google Calendar sync.
test.use({ viewport: { width: 1440, height: 900 } });
const API = "http://cal.test";
const b64 = (s: string) => Buffer.from(s).toString("base64url");

async function setup(page: Page, opts: { calendarScope: boolean; mail?: { subject: string; body: string } }) {
  const calls = { list: 0, create: [] as unknown[] };
  const tomorrow = new Date(Date.now() + 86_400_000);
  tomorrow.setUTCHours(9, 30, 0, 0);
  const end = new Date(tomorrow.getTime() + 10 * 60_000);
  await page.route(`${API}/**`, async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/ai/status") return route.fulfill({ json: { enabled: false, model: null } });
    if (u.pathname === "/auth/me") return route.fulfill({ json: { user: { id: "u1", email: "riya@gmail.com", name: "Riya Sharma", timezone: "Asia/Kolkata", use: "both", onboarding_completed: true, has_password: false, google: { email: "riya@gmail.com", gmail: true }, google_accounts: [{ email: "riya@gmail.com", company: null, primary: true }], created_at: "2026-10-18T10:00:00Z" } } });
    if (u.pathname === "/auth/google/token") return route.fulfill({ json: { access_token: "tok", expires_in: 3600, email: "riya@gmail.com", scope: `https://www.googleapis.com/auth/gmail.readonly${opts.calendarScope ? " https://www.googleapis.com/auth/calendar.events" : ""}` } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route("https://gmail.googleapis.com/**", async (route) => {
    if (/\/messages\?/.test(route.request().url())) return route.fulfill({ json: { messages: opts.mail ? [{ id: "m1" }] : [] } });
    if (!opts.mail) return route.fulfill({ json: {} });
    return route.fulfill({ json: { id: "m1", threadId: "t1", labelIds: ["INBOX", "UNREAD"], internalDate: String(Date.now()), snippet: "", payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Dana Cole <dana@acme.com>" }, { name: "To", value: "riya@gmail.com" }, { name: "Subject", value: opts.mail.subject }], body: { data: b64(opts.mail.body) } } } });
  });
  await page.route("https://www.googleapis.com/calendar/v3/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      calls.create.push(req.postDataJSON());
      return route.fulfill({ json: { id: "new1", summary: "x", start: { dateTime: tomorrow.toISOString() }, end: { dateTime: end.toISOString() } } });
    }
    if (/\/events\?/.test(req.url())) {
      calls.list++;
      return route.fulfill({ json: { items: [{ id: "e1", summary: "Career Corner Meeting", start: { dateTime: tomorrow.toISOString() }, end: { dateTime: end.toISOString() } }, { id: "e2", summary: "Founders' Day", start: { date: tomorrow.toISOString().slice(0, 10) }, end: { date: new Date(tomorrow.getTime() + 86_400_000).toISOString().slice(0, 10) } }] } });
    }
    // Google refuses calendar metadata to a token that only has the calendar.events permission; the app must not ask.
    return route.fulfill({ status: 403, json: { error: { message: "Request had insufficient authentication scopes." } } });
  });
  await page.goto("/");
  await page.evaluate((api) => {
    localStorage.clear();
    localStorage.setItem("c16.api_url", api);
    localStorage.setItem("c16.google_client_id", "test.apps.googleusercontent.com");
  }, API);
  return calls;
}

test("a meeting written in UTC is shown and edited in IST, with a note saying it was converted", async ({ page }) => {
  await setup(page, { calendarScope: false, mail: { subject: "Career corner chat", body: "Hi Riya, can we schedule a meeting on 20 October 9:30-9:40 AM UTC? Ten minutes is enough." } });
  await page.goto("/inbox");
  await page.locator("li[data-thread]", { hasText: "Career corner chat" }).first().click();
  const card = page.locator("[id^=proposal-]").first();
  await expect(card).toContainText("03:00 PM–03:10 PM IST");
  await expect(card).toContainText("Converted to IST (UTC+5:30) from sender's timezone (UTC+00:00)");
  await expect(card.getByLabel("Start time")).toHaveValue("15:00");
  await expect(card.getByLabel("Date")).toHaveValue(/\d{4}-10-20/);
});

test("with Calendar allowed at sign-in the calendar loads by itself, a 10-minute meeting stays readable, and Sync pulls new events", async ({ page }) => {
  const calls = await setup(page, { calendarScope: true });
  await page.goto("/calendar");
  await expect(page.getByText("No calendar connected")).toHaveCount(0);
  await expect(page.getByText("Google Calendar: riya@gmail.com")).toBeVisible();
  await expect(page.getByText("(UTC+5:30)")).toBeVisible(); // the grid's zone label
  const block = page.getByRole("button", { name: /Career Corner Meeting/ });
  await expect(block).toContainText("03:00 PM–03:10 PM IST"); // title and time both present
  const box = (await block.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(30);
  expect(await block.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true); // nothing is cut off
  await expect(page.getByRole("button", { name: /Founders' Day/ })).toBeVisible(); // an all-day event keeps its date
  const before = calls.list;
  await page.getByRole("button", { name: "Sync calendar" }).click();
  await expect.poll(() => calls.list).toBeGreaterThan(before);
});

test("without Calendar permission the person is offered to allow it through the server sign-in", async ({ page }) => {
  await setup(page, { calendarScope: false });
  await page.goto("/calendar");
  await expect(page.getByText("No calendar connected")).toBeVisible();
  await expect(page.getByText(/has not given Triagedesk access to your Calendar/)).toBeVisible(); // says why, not just "not connected"
  await expect(page.getByRole("button", { name: /Connect Google Calendar/ })).toBeEnabled();
});
