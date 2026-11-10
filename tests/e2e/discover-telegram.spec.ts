import { expect, test } from "@playwright/test";
import { signUp, uniqueEmail, expectAccessible } from "./helpers";

// Same values as the E2E environment (.env locally, workflow env in CI).
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "e2e-webhook-secret-0123456789abcdef0123";
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-cron-secret-0123456789abcdef0123456789";

test("Discover: sample offers in the demo, add one to the pipeline, save a search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Try the demo/ }).first().click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Discover" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Discover" })).toBeVisible();
  await expect(page.getByText("Sample", { exact: true }).first()).toBeVisible();
  await expectAccessible(page);

  const title = "Développeur web full-stack en alternance";
  await page.locator("li", { hasText: title }).getByRole("button", { name: "Add to pipeline" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Created as Saved")).toBeVisible();

  await page.goto("/app/discover?tab=added");
  await expect(page.getByRole("link", { name: "Open application" })).toBeVisible();

  await page.goto("/app/discover");
  await page.getByLabel("Name", { exact: true }).fill("Dev Montpellier");
  await page.getByLabel("Départements").fill("34, 30");
  await page.getByRole("button", { name: "Save search" }).click();
  await expect(page.locator("li", { hasText: "Dev Montpellier" })).toContainText("34, 30");

  // Invalid départements are rejected by the server.
  await page.getByLabel("Name", { exact: true }).fill("Bad");
  await page.getByLabel("Départements").fill("99");
  await page.getByRole("button", { name: "Save search" }).click();
  await expect(page.getByText("Invalid value.")).toBeVisible();
});

test("Telegram: connect through the real webhook, then disconnect", async ({ page, request }) => {
  await signUp(page, "Tara", uniqueEmail("tg"));
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Connect Telegram" }).click();
  const link = page.getByRole("link", { name: "Open Telegram to connect" });
  const href = (await link.getAttribute("href")) ?? "";
  expect(href).toMatch(/^https:\/\/t\.me\/ApplyFlowAppBot\?start=[\w-]{32}$/);
  const token = href.split("start=")[1];

  const update = (chatId: number) => ({
    update_id: 1,
    message: { message_id: 1, chat: { id: chatId, type: "private" }, from: { id: chatId, username: "tara_e2e" }, text: `/start ${token}` },
  });
  // Without Telegram's secret header: refused.
  expect((await request.post("/api/telegram/webhook", { data: update(1) })).status()).toBe(401);
  expect((await request.post("/api/telegram/webhook", { data: update(1), headers: { "x-telegram-bot-api-secret-token": "wrong" } })).status()).toBe(401);
  // As Telegram: accepted (the reply to Telegram fails offline; the link is made first).
  const chatId = 700_000_000 + Math.floor(Math.random() * 1e6);
  const ok = await request.post("/api/telegram/webhook", { data: update(chatId), headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET } });
  expect(ok.status()).toBe(200);

  await page.goto("/app/settings");
  await expect(page.getByText("Connected (@tara_e2e).")).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("button", { name: "Connect Telegram" })).toBeVisible();
});

test("scheduled-job endpoints require the cron secret", async ({ request }) => {
  expect((await request.post("/api/cron/reminders")).status()).toBe(401);
  expect((await request.post("/api/cron/daily", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
  const res = await request.post("/api/cron/reminders", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toHaveProperty("sent");
});
