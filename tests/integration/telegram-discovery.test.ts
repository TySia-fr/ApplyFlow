import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { application, jobOffer, telegramLink, telegramLinkToken, user } from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import * as discovery from "@/server/services/discovery";
import * as bot from "@/server/services/telegram";
import * as apps from "@/server/services/applications";
import * as interviews from "@/server/services/interviews";
import * as followUps from "@/server/services/follow-ups";
import { TelegramError, type Keyboard, type Telegram } from "@/server/integrations/telegram";
import { UnsafeUrlError, type FetchHtml } from "@/server/integrations/safe-fetch";
import type { DiscoveredOffer, JobSource } from "@/server/integrations/lba";
import { applicationInput } from "@/lib/validation";

class FakeTelegram implements Telegram {
  messages: { chatId: number; html: string; keyboard?: Keyboard }[] = [];
  answers: { id: string; text?: string }[] = [];
  edits: { chatId: number; messageId: number; keyboard: Keyboard }[] = [];
  failWith?: TelegramError;
  async sendMessage(chatId: number, html: string, keyboard?: Keyboard) {
    if (this.failWith) throw this.failWith;
    this.messages.push({ chatId, html, keyboard });
  }
  async answerCallback(id: string, text?: string) {
    this.answers.push({ id, text });
  }
  async editKeyboard(chatId: number, messageId: number, keyboard: Keyboard) {
    this.edits.push({ chatId, messageId, keyboard });
  }
  last() {
    return this.messages.at(-1)?.html ?? "";
  }
}

const jobPage = (title: string, company: string) =>
  `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title, hiringOrganization: { name: company } })}</script>`;

let chatSeq = 900_000_000 + Math.floor(Math.random() * 1_000_000);
const newChat = () => ++chatSeq;

async function makeUser(locale = "en") {
  const id = randomUUID();
  await db.insert(user).values({ id, name: `User ${id.slice(0, 4)}`, email: `${id}@example.test`, locale, timezone: "Europe/Paris" });
  return id;
}

const msg = (chatId: number, text: string) => ({
  update_id: 1,
  message: { message_id: 1, chat: { id: chatId, type: "private" }, from: { id: chatId, username: "tester" }, text },
});
const press = (chatId: number, data: string) => ({
  update_id: 2,
  callback_query: { id: `cb-${randomUUID()}`, from: { id: chatId }, data, message: { message_id: 7, chat: { id: chatId, type: "private" } } },
});

async function linkedUser(tg: FakeTelegram, locale = "en") {
  const userId = await makeUser(locale);
  const chatId = newChat();
  const token = await bot.createLinkToken(userId);
  await bot.handleUpdate(msg(chatId, `/start ${token}`), { tg, fetchHtml: noFetch });
  return { userId, chatId };
}

const noFetch: FetchHtml = async () => {
  throw new Error("network disabled in tests");
};

const offer = (id: string, over: Partial<DiscoveredOffer> = {}): DiscoveredOffer => ({
  externalId: id,
  title: `Offer ${id}`,
  company: "Acme",
  location: "Montpellier",
  url: `https://example.com/${id}`,
  contractTypes: "Apprentissage",
  workMode: "hybrid",
  description: null,
  publishedAt: new Date(),
  ...over,
});

afterAll(async () => {
  await db.execute(sql`delete from "user" where email like '%@example.test'`);
});

describe("account linking", () => {
  it("links with a fresh token, and the token works exactly once", async () => {
    const tg = new FakeTelegram();
    const userId = await makeUser();
    const token = await bot.createLinkToken(userId);
    const [a, b] = [newChat(), newChat()];
    await bot.handleUpdate(msg(a, `/start ${token}`), { tg, fetchHtml: noFetch });
    expect(tg.last()).toContain("Connected to ApplyFlow");
    expect((await bot.getLink(userId))?.chatId).toBe(a);
    // Replay by someone else: refused, link unchanged.
    await bot.handleUpdate(msg(b, `/start ${token}`), { tg, fetchHtml: noFetch });
    expect(tg.last()).toContain("invalid or expired");
    expect((await bot.getLink(userId))?.chatId).toBe(a);
  });

  it("stores only a hash, and expired tokens are refused", async () => {
    const userId = await makeUser();
    const token = await bot.createLinkToken(userId);
    const rows = await db.select().from(telegramLinkToken).where(eq(telegramLinkToken.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toContain(token);
    await db.update(telegramLinkToken).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(telegramLinkToken.userId, userId));
    expect(await bot.consumeLinkToken(token)).toBeNull();
  });

  it("a chat belongs to one account: re-linking moves it", async () => {
    const tg = new FakeTelegram();
    const { userId: first, chatId } = await linkedUser(tg);
    const second = await makeUser();
    await bot.handleUpdate(msg(chatId, `/start ${await bot.createLinkToken(second)}`), { tg, fetchHtml: noFetch });
    expect(await bot.getLink(first)).toBeNull();
    expect((await bot.getLink(second))?.chatId).toBe(chatId);
  });

  it("an unlinked chat gets instructions and can't do anything", async () => {
    const tg = new FakeTelegram();
    await bot.handleUpdate(msg(newChat(), "https://example.com/job"), { tg, fetchHtml: async () => ({ finalUrl: "", html: jobPage("X", "Y") }) });
    expect(tg.last()).toContain("isn't connected");
  });
});

describe("adding jobs by link", () => {
  it("creates an application from a page with JobPosting data", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg);
    await bot.handleUpdate(msg(chatId, "check this https://jobs.example.com/42"), {
      tg,
      fetchHtml: async () => ({ finalUrl: "https://jobs.example.com/42", html: jobPage("C++ & Go engineer", "Acme") }),
    });
    expect(tg.last()).toContain("C++ &amp; Go engineer"); // escaped in the reply
    const { rows } = await apps.listApplications(userId, { archived: false, sort: "updated", page: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "C++ & Go engineer", companyName: "Acme", status: "saved" });
  });

  it("asks for details when the page can't be read, then uses the reply", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg);
    await bot.handleUpdate(msg(chatId, "https://www.linkedin.com/jobs/view/1"), { tg, fetchHtml: noFetch });
    expect(tg.last()).toContain("Job title @ Company");
    await bot.handleUpdate(msg(chatId, "Frontend developer @ Globex"), { tg, fetchHtml: noFetch });
    const { rows } = await apps.listApplications(userId, { archived: false, sort: "updated", page: 1 });
    expect(rows[0]).toMatchObject({ title: "Frontend developer", companyName: "Globex" });
    const a = await apps.getApplication(userId, rows[0]!.id);
    expect(a.app.jobUrl).toBe("https://www.linkedin.com/jobs/view/1");
    expect((await bot.getLink(userId))?.pendingUrl).toBeNull();
  });

  it("refuses unsafe links without creating anything", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg);
    await bot.handleUpdate(msg(chatId, "http://169.254.169.254/latest"), {
      tg,
      fetchHtml: async () => {
        throw new UnsafeUrlError("private address");
      },
    });
    expect(tg.last()).toContain("can't open that link");
    expect((await apps.listApplications(userId, { archived: false, sort: "updated", page: 1 })).total).toBe(0);
  });

  it("'I applied' button moves the application and records the event", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg);
    const appId = await apps.createApplication(userId, applicationInput.parse({ title: "T", companyName: "C", status: "saved" }));
    await bot.handleUpdate(press(chatId, `ap:${appId}`), { tg, fetchHtml: noFetch });
    expect(tg.answers.at(-1)?.text).toBe("Marked as applied.");
    const a = await apps.getApplication(userId, appId);
    expect(a.app.status).toBe("applied");
    expect(a.events.map((e) => e.toStatus)).toContain("applied");
  });
});

describe("La Bonne Alternance links", () => {
  const COMPANY = "https://labonnealternance.apprentissage.beta.gouv.fr/emploi/recruteurs_lba/78874347400017/lumapps";
  const OFFER = "https://labonnealternance.apprentissage.beta.gouv.fr/emploi/offres_emploi_lba/6735a1b2c3d4e5f6a7b8c9d0/dev";
  const failFetch: FetchHtml = async () => {
    throw new Error("the page must not be scraped for LBA links");
  };

  it("company page: asks only for the title, uses the company from the link", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg);
    await bot.handleUpdate(msg(chatId, COMPANY), { tg, fetchHtml: failFetch, offers: null });
    expect(tg.last()).toContain("<b>Lumapps</b>");
    await bot.handleUpdate(msg(chatId, "Développeur web"), { tg, fetchHtml: failFetch });
    const { rows } = await apps.listApplications(userId, { archived: false, sort: "updated", page: 1 });
    expect(rows[0]).toMatchObject({ title: "Développeur web", companyName: "Lumapps", status: "saved" });
    const a = await apps.getApplication(userId, rows[0]!.id);
    expect(a.app).toMatchObject({ source: "La Bonne Alternance", employmentType: "apprenticeship", jobUrl: COMPANY });
    expect((await bot.getLink(userId))?.pendingCompany).toBeNull();
  });

  it("company page: 'Title @ Company' corrects the company", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg);
    await bot.handleUpdate(msg(chatId, COMPANY), { tg, fetchHtml: failFetch });
    await bot.handleUpdate(msg(chatId, "Dev full-stack @ LumApps SAS"), { tg, fetchHtml: failFetch });
    const { rows } = await apps.listApplications(userId, { archived: false, sort: "updated", page: 1 });
    expect(rows[0]).toMatchObject({ title: "Dev full-stack", companyName: "LumApps SAS" });
  });

  it("job offer: details come from the API, page is not scraped", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg);
    const asked: string[] = [];
    const offers = { getOffer: async (id: string) => (asked.push(id), offer("lba1", { title: "Alternant DevOps", company: "Orbital Rail", location: "34000 Montpellier", workMode: "hybrid" as const })) };
    await bot.handleUpdate(msg(chatId, OFFER), { tg, fetchHtml: failFetch, offers });
    expect(asked).toEqual(["6735a1b2c3d4e5f6a7b8c9d0"]);
    expect(tg.last()).toContain("Alternant DevOps");
    const { rows } = await apps.listApplications(userId, { archived: false, sort: "updated", page: 1 });
    const a = await apps.getApplication(userId, rows[0]!.id);
    expect(a.app).toMatchObject({ title: "Alternant DevOps", location: "34000 Montpellier", workMode: "hybrid", employmentType: "apprenticeship", source: "La Bonne Alternance" });
    expect(a.companyName).toBe("Orbital Rail");
  });

  it("job offer: removed offer or API error falls back to asking, nothing invented", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg);
    await bot.handleUpdate(msg(chatId, OFFER), { tg, fetchHtml: failFetch, offers: { getOffer: async () => null } });
    expect(tg.last()).toContain("Job title @ Company");
    await bot.handleUpdate(msg(chatId, OFFER), { tg, fetchHtml: failFetch, offers: { getOffer: async () => Promise.reject(new Error("503")) } });
    expect(tg.last()).toContain("Job title @ Company");
    expect((await apps.listApplications(userId, { archived: false, sort: "updated", page: 1 })).total).toBe(0);
  });
});

describe("authorization through the bot", () => {
  it("a button carrying another user's id does nothing and reveals nothing", async () => {
    const tg = new FakeTelegram();
    const alice = await linkedUser(tg);
    const bob = await linkedUser(tg);
    await discovery.ingestOffers(alice.userId, null, "lba", [offer("x1")]);
    const [aliceOffer] = await discovery.listOffers(alice.userId, "new");
    const aliceApp = await apps.createApplication(alice.userId, applicationInput.parse({ title: "Secret", companyName: "S" }));

    for (const data of [`oa:${aliceOffer!.id}`, `od:${aliceOffer!.id}`, `ap:${aliceApp}`]) {
      await bot.handleUpdate(press(bob.chatId, data), { tg, fetchHtml: noFetch });
      expect(tg.answers.at(-1)?.text).toBe("This item is no longer available.");
    }
    expect((await discovery.listOffers(alice.userId, "new")).map((o) => o.id)).toEqual([aliceOffer!.id]);
    expect((await apps.getApplication(alice.userId, aliceApp)).app.status).toBe("interested");
    expect((await apps.listApplications(bob.userId, { archived: false, sort: "updated", page: 1 })).total).toBe(0);
  });
});

describe("discovery", () => {
  it("deduplicates offers per user across runs, but not across users", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    expect(await discovery.ingestOffers(a, null, "lba", [offer("1"), offer("2")])).toBe(2);
    expect(await discovery.ingestOffers(a, null, "lba", [offer("2"), offer("3")])).toBe(1);
    expect(await discovery.ingestOffers(b, null, "lba", [offer("1")])).toBe(1);
    expect((await discovery.offerCounts(a)).new).toBe(3);
  });

  it("runs a saved search against the source and records errors without losing data", async () => {
    const userId = await makeUser();
    const id = await discovery.createSavedSearch(userId, { name: "Dev", families: ["software_dev"], departements: ["34"], diplomaLevel: 6, notifyTelegram: true });
    const calls: unknown[] = [];
    const ok: JobSource = { search: async (q) => (calls.push(q), { offers: [offer("a"), offer("b")], invalid: 1 }) };
    expect(await discovery.runSavedSearch(userId, id, ok)).toEqual({ found: 2, added: 2 });
    expect(calls[0]).toEqual({ romeCodes: ["M1805"], departements: ["34"], diplomaLevel: 6 });

    const failing: JobSource = { search: async () => Promise.reject(new Error("La Bonne Alternance returned 503")) };
    await expect(discovery.runSavedSearch(userId, id, failing)).rejects.toThrow();
    const [s] = await discovery.listSavedSearches(userId);
    expect(s?.lastError).toContain("503");
    expect((await discovery.offerCounts(userId)).new).toBe(2);
  });

  it("adding an offer is idempotent and links offer ↔ application", async () => {
    const userId = await makeUser();
    await discovery.ingestOffers(userId, null, "lba", [offer("z", { contractTypes: "Apprentissage" })]);
    const [o] = await discovery.listOffers(userId, "new");
    const first = await discovery.addOfferToPipeline(userId, o!.id);
    const second = await discovery.addOfferToPipeline(userId, o!.id);
    expect(second).toBe(first);
    const a = await apps.getApplication(userId, first);
    expect(a.app).toMatchObject({ title: "Offer z", status: "saved", employmentType: "apprenticeship", source: "La Bonne Alternance" });
    expect((await discovery.listOffers(userId, "added"))[0]?.applicationId).toBe(first);
    // Deleting the application keeps the offer (and its owner); only the link is cleared.
    await apps.deleteApplication(userId, first);
    const [after] = await db.select().from(jobOffer).where(eq(jobOffer.id, o!.id));
    expect(after).toMatchObject({ userId, applicationId: null });
  });

  it("limits saved searches per user and 'run now' per hour", async () => {
    const userId = await makeUser();
    const input = { name: "S", families: ["software_dev" as const], departements: ["34"], diplomaLevel: 6, notifyTelegram: false };
    for (let i = 0; i < discovery.MAX_SAVED_SEARCHES; i++) await discovery.createSavedSearch(userId, input);
    await expect(discovery.createSavedSearch(userId, input)).rejects.toMatchObject({ fields: { _form: "tooManySearches" } });
    const [s] = await discovery.listSavedSearches(userId);
    const src: JobSource = { search: async () => ({ offers: [], invalid: 0 }) };
    for (let i = 0; i < 6; i++) await discovery.runSavedSearchNow(userId, s!.id, src);
    await expect(discovery.runSavedSearchNow(userId, s!.id, src)).rejects.toThrow();
  });

  it("another user's saved search can't be run or deleted", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const id = await discovery.createSavedSearch(a, { name: "A", families: ["hr"], departements: ["75"], diplomaLevel: 7, notifyTelegram: false });
    const src: JobSource = { search: async () => ({ offers: [offer("q")], invalid: 0 }) };
    await expect(discovery.runSavedSearch(b, id, src)).rejects.toBeInstanceOf(NotFoundError);
    await expect(discovery.deleteSavedSearch(b, id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await discovery.listSavedSearches(a)).toHaveLength(1);
  });
});

describe("scheduled notifications", () => {
  it("digest sends each new offer once, with buttons, and marks it notified", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg);
    const sid = await discovery.createSavedSearch(userId, { name: "Dev", families: ["software_dev"], departements: ["34"], diplomaLevel: 6, notifyTelegram: true });
    await discovery.ingestOffers(userId, sid, "lba", Array.from({ length: 10 }, (_, i) => offer(`d${i}`)));
    tg.messages = [];
    await bot.sendDigests(tg);
    const mine = tg.messages.filter((m) => m.chatId === chatId);
    expect(mine[0]?.html).toContain("10 new offers");
    expect(mine.filter((m) => m.keyboard)).toHaveLength(bot.DIGEST_LIMIT);
    expect(mine.at(-1)?.html).toContain("2 more");
    tg.messages = [];
    await bot.sendDigests(tg);
    expect(tg.messages.filter((m) => m.chatId === chatId)).toHaveLength(0);
  });

  it("offers from searches with Telegram off are not sent", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg);
    const sid = await discovery.createSavedSearch(userId, { name: "Quiet", families: ["hr"], departements: ["75"], diplomaLevel: 6, notifyTelegram: false });
    await discovery.ingestOffers(userId, sid, "lba", [offer("quiet1")]);
    tg.messages = [];
    await bot.sendDigests(tg);
    expect(tg.messages.filter((m) => m.chatId === chatId)).toHaveLength(0);
  });

  it("reminders: an interview within 24 h and a due follow-up, each sent exactly once", async () => {
    const tg = new FakeTelegram();
    const { userId, chatId } = await linkedUser(tg, "fr");
    const appId = await apps.createApplication(userId, applicationInput.parse({ title: "Dev", companyName: "Acme" }));
    const in3h = new Date(Date.now() + 3 * 3600e3);
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }).format(in3h).replace(" ", "T");
    await interviews.createInterview(userId, { applicationId: appId, type: "video", localDateTime: local, timezone: "Europe/Paris", durationMinutes: 60 });
    await followUps.createFollowUp(userId, { applicationId: appId, title: "Relancer RH", dueDate: "2020-01-01" });
    // 10:00 Paris time so the follow-up passes the "after 08:00 local" rule.
    const now = new Date(new Date().toISOString().slice(0, 10) + "T09:00:00Z");
    const nowForInterview = new Date(Math.min(now.getTime(), in3h.getTime() - 3600e3));
    tg.messages = [];
    await bot.sendReminders(tg, nowForInterview);
    await bot.sendReminders(tg, nowForInterview); // second run: nothing new
    await bot.sendReminders(tg, now);
    const mine = tg.messages.filter((m) => m.chatId === chatId).map((m) => m.html);
    expect(mine.filter((h) => h.includes("Entretien"))).toHaveLength(1);
    expect(mine.filter((h) => h.includes("Relancer RH"))).toHaveLength(1);
  });

  it("a user who blocked the bot is unlinked, and a failed send is retried next time", async () => {
    const tg = new FakeTelegram();
    const { userId } = await linkedUser(tg);
    await followUps.createFollowUp(userId, { title: "Ping", dueDate: "2020-01-01" });
    const now = new Date(new Date().toISOString().slice(0, 10) + "T12:00:00Z");
    tg.failWith = new TelegramError("Too Many Requests", 429);
    await bot.sendReminders(tg, now);
    expect(await bot.getLink(userId)).not.toBeNull(); // transient: still linked, claim released
    tg.failWith = new TelegramError("Forbidden: bot was blocked by the user", 403);
    await bot.sendReminders(tg, now);
    expect(await bot.getLink(userId)).toBeNull();
    const [row] = await db.select().from(telegramLink).where(and(eq(telegramLink.userId, userId)));
    expect(row).toBeUndefined();
  });
});

describe("cascade", () => {
  it("deleting an account removes its Telegram link, searches and offers", async () => {
    const tg = new FakeTelegram();
    const { userId } = await linkedUser(tg);
    await discovery.ingestOffers(userId, null, "lba", [offer("c1")]);
    await db.delete(user).where(eq(user.id, userId));
    expect(await db.select().from(telegramLink).where(eq(telegramLink.userId, userId))).toHaveLength(0);
    expect(await db.select().from(jobOffer).where(eq(jobOffer.userId, userId))).toHaveLength(0);
    expect(await db.select().from(application).where(eq(application.userId, userId))).toHaveLength(0);
  });
});
