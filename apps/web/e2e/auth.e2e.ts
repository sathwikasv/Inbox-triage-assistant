import { expect, test, type Page } from "@playwright/test";

// Landing, sign up, sign in, password reset and the first-run setup guide. The server is mocked here;
// apps/api/tests/auth.test.ts covers the real account rules against MongoDB.
test.use({ viewport: { width: 1440, height: 900 } });

const API = "http://accounts.test";
const user = { id: "u1", email: "riya@example.com", name: "Riya Sharma", timezone: "Asia/Kolkata", use: "both", onboarding_completed: false, created_at: "2026-10-18T10:00:00Z" };

async function server(page: Page, opts: { db?: boolean; signedIn?: boolean } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  let me: typeof user | null = opts.signedIn ? { ...user } : null;
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.postDataJSON?.() ?? null;
    calls.push({ method: req.method(), path, body });
    if (path === "/ai/status") return route.fulfill({ json: { enabled: false, model: null } });
    if (path.startsWith("/auth") && opts.db === false) return route.fulfill({ status: 503, json: { error: "Accounts need the database, which is not connected on this server (MONGODB_URI)." } });
    if (path === "/auth/me" && req.method() === "GET") return me ? route.fulfill({ json: { user: me } }) : route.fulfill({ status: 401, json: { error: "not signed in" } });
    if (path === "/auth/me" && req.method() === "PATCH") return route.fulfill({ json: { user: (me = { ...me!, ...(body as object) }) } });
    if (path === "/auth/signup") return route.fulfill({ status: 201, json: { user: (me = { ...user, name: (body as { name: string }).name }) } });
    if (path === "/auth/login") return (body as { password: string }).password === "inbox2026" ? route.fulfill({ json: { user: (me = { ...user, onboarding_completed: true }) } }) : route.fulfill({ status: 401, json: { error: "Wrong email or password." } });
    if (path === "/auth/forgot") return route.fulfill({ status: 503, json: { error: "Password reset emails are not set up on this site yet. Ask the site owner to configure SMTP_URL." } });
    if (path === "/auth/logout") return route.fulfill({ json: { ok: true } });
    return route.fulfill({ status: 404, json: { error: "not mocked" } });
  });
  await page.goto("/");
  await page.evaluate((api) => {
    localStorage.clear();
    localStorage.setItem("c16.api_url", api);
  }, API);
  await page.reload();
  return calls;
}

test("a new visitor signs up from the landing page and lands on the dashboard with the setup guide", async ({ page }) => {
  const calls = await server(page);
  await expect(page.getByRole("heading", { name: /Every inbox, sorted/ })).toBeVisible();
  await page.getByRole("link", { name: "Get started" }).first().click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByLabel("Full name").fill("Riya Sharma");
  await page.getByLabel("Email").fill("riya@example.com");
  await page.locator("#password").fill("inbox2026");
  await page.locator("#confirm").fill("inbox2026");
  await expect(page.getByText("Letters and numbers")).toBeVisible();
  await page.getByText(/never sends anything without my confirmation/).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Welcome, Riya! Let's set up your inbox")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Connect your mailboxes")).toBeVisible();
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await expect(page.getByText("Welcome, Riya! Let's set up your inbox")).toHaveCount(0);
  expect(calls.some((c) => c.method === "PATCH" && (c.body as { onboarding_completed?: boolean })?.onboarding_completed === true)).toBe(true);
  expect(calls.find((c) => c.path === "/auth/signup")?.body).toMatchObject({ name: "Riya Sharma", email: "riya@example.com", timezone: expect.any(String) });
});

test("a wrong password is refused with one clear message; forgot password says honestly that reset email is not set up", async ({ page }) => {
  await server(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill("riya@example.com");
  await page.locator("#password").fill("wrong1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong email or password.");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill("riya@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("alert")).toContainText("Password reset emails are not set up");
});

test("the app sends a signed-out visitor to sign in, then back to where they were going", async ({ page }) => {
  await server(page);
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill("riya@example.com");
  await page.locator("#password").fill("inbox2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/tasks/);
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
});

test("without a database the sign-in page says so and offers to continue without an account", async ({ page }) => {
  await server(page, { db: false });
  await page.goto("/login");
  await expect(page.getByText(/Accounts are not switched on yet/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
  await page.getByRole("button", { name: "Continue without an account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("signing out returns to the sign-in page", async ({ page }) => {
  await server(page, { signedIn: true });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "I'll do this later" }).click();
  await page.getByRole("button", { name: "Account and role" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("Continue with Google signs in and shows Gmail mail on the dashboard without a separate connect step", async ({ page }) => {
  let me: Record<string, unknown> | null = null;
  const gmailCalls: string[] = [];
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/ai/status") return route.fulfill({ json: { enabled: false, model: null } });
    if (path === "/auth/google/config") return route.fulfill({ json: { enabled: true, reason: null } });
    if (path === "/auth/google/start") {
      me = { ...user, email: "riya@gmail.com", onboarding_completed: true, has_password: false, google: { email: "riya@gmail.com", gmail: true } };
      return route.fulfill({ status: 302, headers: { location: "http://localhost:4173/dashboard" } });
    }
    if (path === "/auth/google/token") return route.fulfill({ json: { access_token: "ya29.test", expires_in: 3600, email: "riya@gmail.com" } });
    if (path === "/auth/me") return me ? route.fulfill({ json: { user: me } }) : route.fulfill({ status: 401, json: {} });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route("https://gmail.googleapis.com/**", async (route) => {
    const url = route.request().url();
    gmailCalls.push(`${route.request().headers()["authorization"]} ${new URL(url).pathname}`);
    if (url.endsWith("/profile")) return route.fulfill({ json: { emailAddress: "riya@gmail.com" } });
    if (/\/messages\?/.test(url)) return route.fulfill({ json: { messages: [{ id: "g1" }] } });
    const b64 = (s: string) => Buffer.from(s).toString("base64url");
    return route.fulfill({
      json: { id: "g1", threadId: "t1", labelIds: ["INBOX", "UNREAD"], internalDate: String(Date.parse("2026-10-17T09:00:00Z")), snippet: "", payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Karan Desai <karan@example.com>" }, { name: "To", value: "riya@gmail.com" }, { name: "Subject", value: "Q3 budget numbers" }], body: { data: b64("Hi Riya, could you send the final Q3 budget numbers by Friday?") } } },
    });
  });
  await page.goto("/");
  await page.evaluate((api) => {
    localStorage.clear();
    localStorage.setItem("c16.api_url", api);
    localStorage.setItem("c16.google_client_id", "test-client.apps.googleusercontent.com");
  }, API);
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/inbox");
  await expect(page.locator("li[data-thread]", { hasText: "Q3 budget numbers" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Connect Gmail/ })).toHaveCount(0);
  expect(gmailCalls.every((c) => c.startsWith("Bearer ya29.test"))).toBe(true);
});
