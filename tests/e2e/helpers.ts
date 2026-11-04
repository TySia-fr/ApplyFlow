import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export async function signUp(page: Page, name: string, email: string, password = "correct-horse-battery") {
  await page.goto("/en/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

export async function createApplication(page: Page, title: string, company: string) {
  await page.goto("/app/applications/new");
  await page.getByLabel("Job title").fill(title);
  await page.getByLabel("Company", { exact: true }).fill(company);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return page.url().split("/").pop() as string;
}

/** Fails on serious/critical WCAG A/AA violations. */
export async function expectAccessible(page: Page) {
  // @axe-core/playwright is typed against a newer Playwright than the pinned
  // browser build; the runtime API it uses is identical.
  type AxePage = ConstructorParameters<typeof AxeBuilder>[0]["page"];
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
