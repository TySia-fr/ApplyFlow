import { expect, test } from "@playwright/test";

test("mobile: navigation menu works and pages don't overflow horizontally", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Try the demo/ }).click();
  await expect(page).toHaveURL(/\/app$/);

  for (const url of ["/app", "/app/applications", "/app/follow-ups", "/app/documents", "/app/settings"]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${url}`).toBeLessThanOrEqual(1);
  }

  await page.getByText("Menu").click();
  await page.locator("details").getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Interviews" }).click();
  await expect(page).toHaveURL(/\/app\/interviews$/);
});
