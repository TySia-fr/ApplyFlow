import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

test("landing pages render in both languages and pass accessibility checks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("pipeline");
  await expectAccessible(page);
  await page.getByRole("link", { name: "fr", exact: true }).click();
  await expect(page).toHaveURL(/\/fr$/);
  await expect(page.getByRole("button", { name: /Essayer la démo/ })).toBeVisible();
});

test("Try the demo creates an isolated, seeded sandbox", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Try the demo/ }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(/Demo account\. Everything here is sample data/)).toBeVisible();
  await expect(page.getByText("Total applications")).toBeVisible();
  // Seed: 10 applications, 7 ever submitted (the withdrawn one never was),
  // 5 got a reply, 3 reached an interview stage, 1 an offer.
  await expect(page.getByText("5 of 7 submitted")).toBeVisible();
  await expect(page.getByText("3 of 7 submitted")).toBeVisible();
  await expect(page.getByText("1 of 7 submitted")).toBeVisible();
  await expectAccessible(page);

  await page.goto("/app/applications/board");
  await expect(page.getByRole("region", { name: "Offer (1)" })).toContainText("Full-stack Engineer");
  await page.goto("/app/interviews");
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  await page.goto("/app/follow-ups");
  await expect(page.getByText("Overdue · 1")).toBeVisible();
  await page.goto("/app/settings");
  await expect(page.getByText("Demo accounts have no password to change.")).toBeVisible();
});

test("board: dragging a card persists the move and records it in the timeline", async ({ page }) => {
  // Wide enough that both columns are on screen without horizontal scrolling.
  await page.setViewportSize({ width: 2400, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /Try the demo/ }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/applications/board");

  const card = page.getByRole("region", { name: /^Applied/ }).getByText("Platform Engineer");
  const target = page.getByRole("region", { name: /^Screening/ });
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("layout not ready");
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 5 });
  await page.mouse.move(to.x + 40, to.y + to.height - 20, { steps: 15 });
  await page.mouse.up();
  await expect(target).toContainText("Platform Engineer");

  // Survives a reload: it was persisted, not just moved in the DOM.
  await page.reload();
  await expect(page.getByRole("region", { name: /^Screening/ })).toContainText("Platform Engineer");
  await page.getByRole("region", { name: /^Screening/ }).getByRole("link", { name: "Platform Engineer" }).click();
  await expect(page.getByText("Applied → Screening")).toBeVisible();
});
