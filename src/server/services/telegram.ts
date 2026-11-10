import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/server/db";
import {
  application,
  company,
  followUp,
  interview,
  jobOffer,
  savedSearch,
  sentNotification,
  telegramLink,
  telegramLinkToken,
  user,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import { errorFields, log } from "@/server/logger";
import { env } from "@/server/env";
import { addOfferToPipeline, setOfferDismissed } from "@/server/services/discovery";
import { changeStatus, createApplication } from "@/server/services/applications";
import { consumeRateLimit } from "@/server/services/account";
import { encodeCallback, decodeCallback, esc, TelegramError, type Keyboard, type Telegram, type Update } from "@/server/integrations/telegram";
import { extractJobPosting, firstUrl, parseTitleCompany } from "@/server/integrations/job-page";
import { UnsafeUrlError, type FetchHtml } from "@/server/integrations/safe-fetch";
import { getDictionary, t, type Dictionary } from "@/lib/i18n";
import { dateKeyInZone, formatDateTime } from "@/lib/time";
import { applicationInput } from "@/lib/validation";

const LINK_TTL_MS = 15 * 60 * 1000;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

// ─── Linking ────────────────────────────────────────────────────────────────

/** Creates a one-time token (only its hash is stored) and returns the raw value for the t.me link. */
export async function createLinkToken(userId: string, db: Db = defaultDb): Promise<string> {
  const raw = randomBytes(24).toString("base64url"); // 32 chars, valid in /start payloads
  await db.transaction(async (tx) => {
    await tx.delete(telegramLinkToken).where(eq(telegramLinkToken.userId, userId));
    await tx.insert(telegramLinkToken).values({ tokenHash: hash(raw), userId, expiresAt: new Date(Date.now() + LINK_TTL_MS) });
  });
  return raw;
}

/** Consumes a token atomically: it works once, before expiry, then never again. */
export async function consumeLinkToken(raw: string, db: Db = defaultDb): Promise<string | null> {
  if (!/^[\w-]{20,64}$/.test(raw)) return null;
  const [row] = await db
    .delete(telegramLinkToken)
    .where(and(eq(telegramLinkToken.tokenHash, hash(raw)), gt(telegramLinkToken.expiresAt, new Date())))
    .returning({ userId: telegramLinkToken.userId });
  return row?.userId ?? null;
}

export async function linkChat(userId: string, chatId: number, username: string | undefined, db: Db = defaultDb) {
  await db.transaction(async (tx) => {
    // One chat ↔ one account: re-linking moves the chat, never shares it.
    await tx.delete(telegramLink).where(eq(telegramLink.chatId, chatId));
    await tx
      .insert(telegramLink)
      .values({ userId, chatId, username: username ?? null })
      .onConflictDoUpdate({ target: telegramLink.userId, set: { chatId, username: username ?? null, pendingUrl: null, pendingAt: null } });
  });
}

export async function unlinkUser(userId: string, db: Db = defaultDb) {
  await db.delete(telegramLink).where(eq(telegramLink.userId, userId));
}

export async function getLink(userId: string, db: Db = defaultDb) {
  const [row] = await db.select().from(telegramLink).where(eq(telegramLink.userId, userId)).limit(1);
  return row ?? null;
}

async function linkedUser(chatId: number, db: Db) {
  const [row] = await db
    .select({ userId: user.id, name: user.name, locale: user.locale, timezone: user.timezone, pendingUrl: telegramLink.pendingUrl })
    .from(telegramLink)
    .innerJoin(user, eq(user.id, telegramLink.userId))
    .where(eq(telegramLink.chatId, chatId))
    .limit(1);
  return row ?? null;
}

// ─── Incoming updates ───────────────────────────────────────────────────────

export type BotDeps = { tg: Telegram; fetchHtml: FetchHtml; db?: Db };

const appUrl = (path: string) => `${env.APP_URL.replace(/\/$/, "")}${path}`;
/** Telegram rejects URL buttons pointing at http://localhost; only offer them for real hosts. */
const canLink = () => /^https:\/\//.test(env.APP_URL);

function appKeyboard(d: Dictionary, appId: string, withApplied: boolean): Keyboard {
  const row = [];
  if (withApplied) row.push({ text: d.bot.markApplied, callback_data: encodeCallback({ kind: "app_applied", id: appId }) });
  if (canLink()) row.push({ text: d.bot.openApp, url: appUrl(`/app/applications/${appId}`) });
  return row.length ? [row] : [];
}

async function createFromLink(userId: string, url: string, title: string, companyName: string, location: string | null, db: Db) {
  const input = applicationInput.parse({ title, companyName, jobUrl: url, location: location ?? "", source: "Telegram", status: "saved" });
  return createApplication(userId, input, db);
}

export async function handleUpdate(update: Update, deps: BotDeps): Promise<void> {
  const db = deps.db ?? defaultDb;
  if (update.callback_query) return handleCallback(update.callback_query, deps, db);
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== "private") return; // groups and non-text are ignored
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const me = await linkedUser(chatId, db);
  const d = getDictionary(me?.locale ?? (msg.from?.language_code?.startsWith("fr") ? "fr" : "en"));
  const say = (html: string, kb?: Keyboard) => deps.tg.sendMessage(chatId, html, kb && kb.length ? kb : undefined);

  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
  if (start) {
    const token = start[1];
    if (!token) return say(me ? d.bot.help : d.bot.welcome);
    const userId = await consumeLinkToken(token, db);
    if (!userId) return say(d.bot.linkInvalid);
    await linkChat(userId, chatId, msg.from?.username, db);
    const [u] = await db.select({ name: user.name, locale: user.locale }).from(user).where(eq(user.id, userId));
    log.security("telegram.linked", { userId });
    return deps.tg.sendMessage(chatId, t(getDictionary(u?.locale ?? "en").bot.linked, { name: esc(u?.name ?? "") }));
  }

  if (!me) return say(d.bot.notLinked);
  if (/^\/help\b/.test(text)) return say(d.bot.help);
  if (/^\/unlink\b/.test(text)) {
    await unlinkUser(me.userId, db);
    log.security("telegram.unlinked", { userId: me.userId });
    return say(d.bot.unlinked);
  }
  if (/^\/today\b/.test(text)) return say(await todaySummary(me.userId, me.locale, me.timezone, d, db));

  const url = firstUrl(text);
  if (url) {
    if (!(await consumeRateLimit(`tg-links:${chatId}`, 20, 3600, db))) return say(d.bot.tooMany);
    let job = null;
    try {
      const page = await deps.fetchHtml(url);
      job = extractJobPosting(page.html);
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        log.security("telegram.unsafe_url", { userId: me.userId, reason: err.message });
        return say(d.bot.unsafeLink);
      }
      log.info("telegram.page_unreadable", { userId: me.userId, ...errorFields(err) });
    }
    if (job) {
      const appId = await createFromLink(me.userId, url, job.title, job.company ?? "Unspecified company", job.location, db);
      return say(t(d.bot.added, { title: esc(job.title), company: esc(job.company ?? "—") }), appKeyboard(d, appId, true));
    }
    await db.update(telegramLink).set({ pendingUrl: url, pendingAt: new Date() }).where(eq(telegramLink.userId, me.userId));
    return say(d.bot.askDetails);
  }

  if (me.pendingUrl) {
    const tc = parseTitleCompany(text);
    if (tc) {
      const appId = await createFromLink(me.userId, me.pendingUrl, tc.title, tc.company, null, db);
      await db.update(telegramLink).set({ pendingUrl: null, pendingAt: null }).where(eq(telegramLink.userId, me.userId));
      return say(t(d.bot.pendingSaved, { title: esc(tc.title), company: esc(tc.company) }), appKeyboard(d, appId, true));
    }
  }
  return say(d.bot.hint);
}

async function handleCallback(cq: NonNullable<Update["callback_query"]>, deps: BotDeps, db: Db) {
  const chatId = cq.message?.chat.id ?? cq.from.id;
  const me = await linkedUser(chatId, db);
  const d = getDictionary(me?.locale ?? "en");
  const cb = decodeCallback(cq.data);
  if (!me || !cb) return deps.tg.answerCallback(cq.id, me ? d.bot.unavailable : d.bot.notLinked);
  try {
    if (cb.kind === "offer_add") {
      const appId = await addOfferToPipeline(me.userId, cb.id, db);
      await deps.tg.answerCallback(cq.id, d.bot.offerAdded);
      if (cq.message) await deps.tg.editKeyboard(chatId, cq.message.message_id, appKeyboard(d, appId, true));
    } else if (cb.kind === "offer_dismiss") {
      await setOfferDismissed(me.userId, cb.id, true, db);
      await deps.tg.answerCallback(cq.id, d.bot.offerDismissed);
      if (cq.message) await deps.tg.editKeyboard(chatId, cq.message.message_id, []);
    } else {
      await changeStatus(me.userId, cb.id, "applied", "Telegram", db);
      await deps.tg.answerCallback(cq.id, d.bot.markedApplied);
      if (cq.message) await deps.tg.editKeyboard(chatId, cq.message.message_id, appKeyboard(d, cb.id, false));
    }
  } catch (err) {
    // Someone else's id, or a deleted item: same answer, nothing revealed.
    if (err instanceof NotFoundError) {
      log.security("telegram.callback_denied", { userId: me.userId });
      return deps.tg.answerCallback(cq.id, d.bot.unavailable);
    }
    throw err;
  }
}

async function todaySummary(userId: string, locale: string, tz: string, d: Dictionary, db: Db) {
  const now = new Date();
  const [ivs, fus] = await Promise.all([
    upcomingInterviews(db, now, new Date(now.getTime() + 48 * 3600e3), userId),
    db
      .select({ title: followUp.title })
      .from(followUp)
      .where(and(eq(followUp.userId, userId), isNull(followUp.completedAt), lte(followUp.dueAt, new Date(`${dateKeyInZone(now, tz)}T00:00:00Z`))))
      .orderBy(asc(followUp.dueAt))
      .limit(10),
  ]);
  if (!ivs.length && !fus.length) return d.bot.todayNothing;
  return [
    d.bot.todayHeader,
    ...ivs.map((i) => interviewLine(d, i, locale)),
    ...fus.map((f) => t(d.bot.followUpDue, { title: esc(f.title) })),
  ].join("\n");
}

// ─── Scheduled notifications ────────────────────────────────────────────────

function upcomingInterviews(db: Db, from: Date, to: Date, userId?: string) {
  return db
    .select({
      id: interview.id,
      userId: interview.userId,
      type: interview.type,
      scheduledAt: interview.scheduledAt,
      timezone: interview.timezone,
      title: application.title,
      companyName: company.name,
    })
    .from(interview)
    .innerJoin(application, and(eq(application.userId, interview.userId), eq(application.id, interview.applicationId)))
    .innerJoin(company, and(eq(company.userId, application.userId), eq(company.id, application.companyId)))
    .where(
      and(
        gte(interview.scheduledAt, from),
        lte(interview.scheduledAt, to),
        eq(interview.outcome, "pending"),
        ...(userId ? [eq(interview.userId, userId)] : []),
      ),
    )
    .orderBy(asc(interview.scheduledAt));
}

function interviewLine(
  d: Dictionary,
  i: { scheduledAt: Date; timezone: string; type: keyof Dictionary["interviews"]["types"]; title: string; companyName: string },
  locale: string,
) {
  return t(d.bot.interviewSoon, {
    when: esc(formatDateTime(i.scheduledAt, locale, i.timezone)),
    zone: esc(i.timezone),
    type: esc(d.interviews.types[i.type]),
    title: esc(i.title),
    company: esc(i.companyName),
  });
}

/**
 * Claims a notification key before sending, so concurrent or repeated cron
 * runs can't send it twice. If the send fails, the claim is released so the
 * next run retries.
 */
async function sendOnce(db: Db, userId: string, key: string, send: () => Promise<void>): Promise<boolean> {
  const claimed = await db.insert(sentNotification).values({ userId, key }).onConflictDoNothing().returning({ key: sentNotification.key });
  if (!claimed.length) return false;
  try {
    await send();
    return true;
  } catch (err) {
    await db.delete(sentNotification).where(and(eq(sentNotification.userId, userId), eq(sentNotification.key, key)));
    throw err;
  }
}

/** A user who blocked the bot (403) is unlinked instead of retried forever. */
async function handleSendError(db: Db, userId: string, err: unknown) {
  if (err instanceof TelegramError && err.code === 403) {
    await unlinkUser(userId, db);
    log.info("telegram.blocked_unlinked", { userId });
    return;
  }
  log.error("telegram.send_failed", { userId, ...errorFields(err) });
}

const linkedUsers = (db: Db) =>
  db
    .select({ userId: telegramLink.userId, chatId: telegramLink.chatId, locale: user.locale, timezone: user.timezone })
    .from(telegramLink)
    .innerJoin(user, eq(user.id, telegramLink.userId));

export const DIGEST_LIMIT = 8;

/** New offers from searches with Telegram notifications on, at most DIGEST_LIMIT per user per run. */
export async function sendDigests(tg: Telegram, db: Db = defaultDb) {
  let sent = 0;
  for (const u of await linkedUsers(db)) {
    const d = getDictionary(u.locale);
    const offers = await db
      .select({ id: jobOffer.id, title: jobOffer.title, company: jobOffer.company, location: jobOffer.location, url: jobOffer.url })
      .from(jobOffer)
      .innerJoin(savedSearch, and(eq(savedSearch.userId, jobOffer.userId), eq(savedSearch.id, jobOffer.savedSearchId)))
      .where(and(eq(jobOffer.userId, u.userId), eq(jobOffer.state, "new"), isNull(jobOffer.notifiedAt), eq(savedSearch.notifyTelegram, true)))
      .orderBy(sql`${jobOffer.publishedAt} desc nulls last`)
      .limit(50);
    if (!offers.length) continue;
    const batch = offers.slice(0, DIGEST_LIMIT);
    try {
      await tg.sendMessage(u.chatId, t(d.bot.digestHeader, { count: offers.length }));
      for (const o of batch) {
        const buttons: Keyboard = [
          [
            { text: d.bot.addOffer, callback_data: encodeCallback({ kind: "offer_add", id: o.id }) },
            { text: d.bot.dismissOffer, callback_data: encodeCallback({ kind: "offer_dismiss", id: o.id }) },
          ],
          ...(o.url ? [[{ text: d.bot.viewOffer, url: o.url }]] : []),
        ];
        await tg.sendMessage(u.chatId, `<b>${esc(o.title)}</b>\n${esc([o.company, o.location].filter(Boolean).join(" · "))}`, buttons);
        sent++;
      }
      if (offers.length > batch.length) await tg.sendMessage(u.chatId, t(d.bot.digestMore, { count: offers.length - batch.length }));
      // Everything in this run counts as notified, including the overflow shown as "+N more".
      await db.update(jobOffer).set({ notifiedAt: new Date() }).where(inArray(jobOffer.id, offers.map((o) => o.id)));
    } catch (err) {
      await handleSendError(db, u.userId, err);
    }
  }
  return { sent };
}

/** Interviews in the next 24 h and follow-ups due today or earlier. Each sent once. */
export async function sendReminders(tg: Telegram, now = new Date(), db: Db = defaultDb) {
  let sent = 0;
  const users = await linkedUsers(db);
  if (!users.length) return { sent };
  const byUser = new Map(users.map((u) => [u.userId, u]));
  const soon = await upcomingInterviews(db, now, new Date(now.getTime() + 24 * 3600e3));
  for (const i of soon) {
    const u = byUser.get(i.userId);
    if (!u) continue;
    const d = getDictionary(u.locale);
    try {
      if (await sendOnce(db, u.userId, `interview:${i.id}`, () => tg.sendMessage(u.chatId, interviewLine(d, i, u.locale)))) sent++;
    } catch (err) {
      await handleSendError(db, u.userId, err);
    }
  }
  for (const u of users) {
    // "Due" means due on the user's own calendar day, and only after 08:00 their time.
    const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: u.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
    if (localHour < 8) continue;
    const today = new Date(`${dateKeyInZone(now, u.timezone)}T00:00:00Z`);
    const due = await db
      .select({ id: followUp.id, title: followUp.title, applicationId: followUp.applicationId })
      .from(followUp)
      .where(and(eq(followUp.userId, u.userId), isNull(followUp.completedAt), lte(followUp.dueAt, today)))
      .limit(20);
    const d = getDictionary(u.locale);
    for (const f of due) {
      const kb = f.applicationId && canLink() ? [[{ text: d.bot.openApp, url: appUrl(`/app/applications/${f.applicationId}`) }]] : undefined;
      try {
        if (await sendOnce(db, u.userId, `followup:${f.id}`, () => tg.sendMessage(u.chatId, t(d.bot.followUpDue, { title: esc(f.title) }), kb))) sent++;
      } catch (err) {
        await handleSendError(db, u.userId, err);
      }
    }
  }
  return { sent };
}
