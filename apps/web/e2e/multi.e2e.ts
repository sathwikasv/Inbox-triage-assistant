import { expect, test } from "@playwright/test";

// Two Gmail accounts from different companies connected at once (linked to the login), labelled and filterable.
test.use({ viewport: { width: 1440, height: 900 } });

const API = "http://multi.test";
const ACCOUNTS = [
  { email: "riya@fynd.com", company: "Fynd Retail", primary: true },
  { email: "riya@acme.com", company: "Acme Corp", primary: false },
];
const MAIL: Record<string, { subject: string; from: string; body: string }> = {
  "tok-riya@fynd.com": { subject: "Q3 budget numbers", from: "Karan Desai <karan@fynd.com>", body: "Hi Riya, could you send the final Q3 budget numbers by Friday?" },
  "tok-riya@acme.com": { subject: "Acme contract review", from: "Dana Cole <dana@acme.com>", body: "Hi Riya, please review the Acme contract draft before Monday." },
};
const b64 = (s: string) => Buffer.from(s).toString("base64url");

test.beforeEach(async ({ page }) => {
  const patched: unknown[] = [];
  await page.route(`${API}/**`, async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/ai/status") return route.fulfill({ json: { enabled: false, model: null } });
    if (u.pathname === "/auth/google/config") return route.fulfill({ json: { enabled: true, reason: null } });
    if (u.pathname === "/auth/me") return route.fulfill({ json: { user: { id: "u1", email: "riya@fynd.com", name: "Riya Sharma", timezone: "Asia/Kolkata", use: "both", onboarding_completed: true, has_password: false, google: { email: "riya@fynd.com", gmail: true }, google_accounts: ACCOUNTS, created_at: "2026-10-18T10:00:00Z" } } });
    if (u.pathname === "/auth/google/token") return route.fulfill({ json: { access_token: `tok-${u.searchParams.get("email")}`, expires_in: 3600, email: u.searchParams.get("email") } });
    if (u.pathname === "/auth/google/accounts") {
      patched.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route("https://gmail.googleapis.com/**", async (route) => {
    const mail = MAIL[(route.request().headers()["authorization"] ?? "").replace("Bearer ", "")];
    if (!mail) return route.fulfill({ status: 401, json: {} });
    if (/\/messages\?/.test(route.request().url())) return route.fulfill({ json: { messages: [{ id: "m1" }] } });
    return route.fulfill({ json: { id: "m1", threadId: "t1", labelIds: ["INBOX", "UNREAD"], internalDate: String(Date.parse("2026-10-17T09:00:00Z")), snippet: "", payload: { mimeType: "text/plain", headers: [{ name: "From", value: mail.from }, { name: "To", value: "riya@fynd.com" }, { name: "Subject", value: mail.subject }], body: { data: b64(mail.body) } } } });
  });
  await page.goto("/");
  await page.evaluate((api) => {
    localStorage.clear();
    localStorage.setItem("c16.api_url", api);
    localStorage.setItem("c16.google_client_id", "test-client.apps.googleusercontent.com");
  }, API);
});

test("both Gmail accounts load, each shows its company, and the inbox filters by company or mailbox", async ({ page }) => {
  await page.goto("/inbox");
  const q3 = page.locator("li[data-thread]", { hasText: "Q3 budget numbers" });
  const acme = page.locator("li[data-thread]", { hasText: "Acme contract review" });
  await expect(q3).toBeVisible();
  await expect(acme).toBeVisible();
  await expect(q3.getByText("Fynd Retail")).toBeVisible();
  await expect(acme.getByText("Acme Corp")).toBeVisible();

  const filter = page.getByLabel("Filter by company or mailbox");
  await filter.selectOption("company:Acme Corp");
  await expect(acme).toBeVisible();
  await expect(q3).toHaveCount(0);
  await filter.selectOption("account:gmail:riya@fynd.com");
  await expect(q3).toBeVisible();
  await expect(acme).toHaveCount(0);
  await filter.selectOption("all");
  await expect(acme).toBeVisible();
});

test("settings lists the accounts by company, lets the company be renamed, and never blocks adding another Gmail", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("region", { name: "Fynd Retail" })).toContainText("riya@fynd.com");
  await expect(page.getByRole("region", { name: "Acme Corp" })).toContainText("riya@acme.com");
  await page.getByRole("button", { name: "Edit company for riya@acme.com" }).click();
  await page.getByLabel("Company for riya@acme.com").fill("Client B");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Client B" })).toContainText("riya@acme.com");
  // Each account has its own Sync and Disconnect.
  await expect(page.getByRole("region", { name: "Client B" }).getByRole("button", { name: "Sync" })).toBeEnabled();
  // Gmail is already connected twice, yet adding more is still offered.
  await expect(page.getByRole("button", { name: /Connect other Gmail account/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Connect Gmail/ })).toBeEnabled();
});
