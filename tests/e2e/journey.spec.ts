import path from "node:path";
import { expect, test } from "@playwright/test";
import { createApplication, expectAccessible, signUp, uniqueEmail } from "./helpers";

test("full journey: sign up → application → status → interview → follow-up → resume → dashboard → sign out", async ({ page }) => {
  await signUp(page, "Ada Tester", uniqueEmail("journey"));

  // New account: honest empty state, no fake numbers.
  await expect(page.getByText("Your dashboard fills in as you work")).toBeVisible();
  await expectAccessible(page);

  // Validation: empty required fields are rejected server-side and the form says so.
  await page.goto("/app/applications/new");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  await expect(page.getByLabel("Job title")).toHaveAttribute("aria-invalid", "true");

  const id = await createApplication(page, "Senior Frontend Engineer", "Acme Robotics");
  await expect(page.getByText("Created as Interested")).toBeVisible();
  await expectAccessible(page);

  // Status change writes a timeline event.
  await page.getByLabel("Change status").selectOption("applied");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Interested → Applied")).toBeVisible();
  await page.getByLabel("Change status").selectOption("interview");
  await page.getByLabel("Note (optional)").fill("Recruiter called back");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Applied → Interview")).toBeVisible();
  await expect(page.getByText("Recruiter called back")).toBeVisible();

  // Interview scheduled in Europe/Paris.
  await page.getByRole("button", { name: "Schedule interview" }).click();
  const future = new Date(Date.now() + 3 * 864e5);
  const local = `${future.toISOString().slice(0, 10)}T10:30`;
  await page.getByLabel("Date and time").fill(local);
  await page.getByLabel("Timezone").fill("Europe/Paris");
  await page.getByRole("button", { name: "Schedule interview" }).click();
  await expect(page.getByText(/\(Europe\/Paris\)/)).toBeVisible();

  // Follow-up.
  await page.getByLabel("What to do").fill("Send thank-you email");
  await page.getByLabel("Due").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Add follow-up" }).click();
  await expect(page.getByText("Send thank-you email")).toBeVisible();

  // Upload a resume, then attach it to the application.
  await page.goto("/app/documents");
  await page.getByLabel("File").setInputFiles(path.join(__dirname, "../fixtures/resume.pdf"));
  await page.getByLabel("Title", { exact: true }).fill("Resume EN");
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText("Resume EN")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("Resume-EN.pdf");

  // Spoofed upload: a text file renamed to .pdf is rejected by content sniffing.
  await page.getByLabel("File").setInputFiles({ name: "evil.pdf", mimeType: "application/pdf", buffer: Buffer.from("<script>alert(1)</script>") });
  await page.getByLabel("Title", { exact: true }).fill("Not a PDF");
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText("Unsupported file.")).toBeVisible();

  await page.goto(`/app/applications/${id}/edit`);
  await page.getByLabel("Resume").selectOption({ label: "Resume EN (v1)" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: "Resume EN" })).toBeVisible();

  // Dashboard reflects the real history.
  await page.goto("/app");
  await expect(page.getByText("1 of 1 submitted").first()).toBeVisible();
  await expect(page.getByText(/too early to read as a trend/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Acme Robotics · Senior Frontend Engineer" }).first()).toBeVisible();

  // Board shows the card in its column.
  await page.goto("/app/applications/board");
  await expect(page.getByRole("region", { name: "Interview (1)" })).toContainText("Senior Frontend Engineer");

  // Search finds it; filters that exclude it show the no-results state.
  await page.goto("/app/applications?q=acme");
  await expect(page.getByRole("link", { name: "Senior Frontend Engineer" })).toBeVisible();
  await page.goto("/app/applications?status=offer");
  await expect(page.getByText("No applications match these filters.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("French interface after switching language", async ({ page }) => {
  await signUp(page, "Camille", uniqueEmail("fr"));
  await page.goto("/app/settings");
  await page.getByLabel("Language").selectOption("fr");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Paramètres" })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord", exact: true })).toBeVisible();
  await expect(page.locator("[lang=fr]").first()).toBeVisible();
});
