import path from "node:path";
import { expect, test } from "@playwright/test";
import { createApplication, signUp, uniqueEmail } from "./helpers";

test("a user cannot read, edit, or download another user's records", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  await signUp(alice, "Alice", uniqueEmail("alice"));
  const appId = await createApplication(alice, "Private role", "Secret Corp");
  await alice.goto("/app/documents");
  await alice.getByLabel("File").setInputFiles(path.join(__dirname, "../fixtures/resume.pdf"));
  await alice.getByLabel("Title", { exact: true }).fill("Alice CV");
  await alice.getByRole("button", { name: "Upload document" }).click();
  const href = await alice.getByRole("link", { name: "Download" }).getAttribute("href");
  expect(href).toMatch(/^\/api\/documents\//);

  const bob = await (await browser.newContext()).newPage();
  await signUp(bob, "Bob", uniqueEmail("bob"));

  for (const url of [`/app/applications/${appId}`, `/app/applications/${appId}/edit`]) {
    const res = await bob.goto(url);
    // Streaming responses commit 200 before notFound() renders; assert on content.
    await expect(bob.getByRole("heading", { name: "Not found" })).toBeVisible();
    expect(await bob.content()).not.toContain("Secret Corp");
    expect(res).not.toBeNull();
  }
  // fetch() from the page so the browser sends its (Secure) session cookie.
  const status = (p: typeof bob, url: string) => p.evaluate(async (u) => (await fetch(u)).status, url);
  expect(await status(bob, href as string)).toBe(404);

  // Bob's lists don't include Alice's data.
  await bob.goto("/app/applications?q=Secret");
  await expect(bob.getByText("No applications match these filters.")).toBeVisible();

  // Unauthenticated download is refused.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/");
  expect(await status(anon, href as string)).toBe(401);
});

test("sign-in errors don't reveal whether an account exists", async ({ page }) => {
  const email = uniqueEmail("enum");
  await signUp(page, "Existing", email);
  await page.context().clearCookies();

  await page.goto("/en/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Scoped to the form: Next's route announcer is also role=alert.
  const alert = page.locator("form").getByRole("alert");
  const forExisting = await alert.textContent();

  await page.getByLabel("Email").fill(uniqueEmail("nobody"));
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(alert).toHaveText(forExisting ?? "");
  expect(forExisting).toContain("Email or password is incorrect.");
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-powered-by"]).toBeUndefined();
});
