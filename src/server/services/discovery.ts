import "server-only";
import { and, asc, count, desc, eq, isNull, lt, or } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/server/db";
import { jobOffer, savedSearch } from "@/server/db/schema";
import { NotFoundError, RateLimitError, ValidationError } from "@/server/errors";
import { errorFields, log } from "@/server/logger";
import { createApplication } from "@/server/services/applications";
import { consumeRateLimit } from "@/server/services/account";
import type { DiscoveredOffer, JobSource } from "@/server/integrations/lba";
import { romeCodesFor, type SavedSearchInput } from "@/lib/discovery";
import { applicationInput } from "@/lib/validation";

export const MAX_SAVED_SEARCHES = 5;
const RERUN_AFTER_MS = 20 * 60 * 60 * 1000;

export async function createSavedSearch(userId: string, input: SavedSearchInput, db: Db = defaultDb) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(savedSearch).where(eq(savedSearch.userId, userId));
  if (n >= MAX_SAVED_SEARCHES) throw new ValidationError({ _form: "tooManySearches" });
  const [row] = await db
    .insert(savedSearch)
    .values({
      userId,
      name: input.name,
      romeCodes: romeCodesFor(input.families),
      departements: input.departements,
      diplomaLevel: input.diplomaLevel,
      notifyTelegram: input.notifyTelegram,
    })
    .returning({ id: savedSearch.id });
  return row?.id as string;
}

export async function deleteSavedSearch(userId: string, id: string, db: Db = defaultDb) {
  const res = await db
    .delete(savedSearch)
    .where(and(eq(savedSearch.userId, userId), eq(savedSearch.id, id)))
    .returning({ id: savedSearch.id });
  if (!res[0]) throw new NotFoundError("Saved search");
}

export async function listSavedSearches(userId: string, db: Db = defaultDb) {
  return db.select().from(savedSearch).where(eq(savedSearch.userId, userId)).orderBy(asc(savedSearch.createdAt));
}

/** Inserts offers not seen before for this user. Returns how many were new. */
export async function ingestOffers(
  userId: string,
  searchId: string | null,
  source: string,
  offers: readonly DiscoveredOffer[],
  db: Db = defaultDb,
): Promise<number> {
  if (offers.length === 0) return 0;
  const inserted = await db
    .insert(jobOffer)
    .values(offers.map((o) => ({ ...o, userId, savedSearchId: searchId, source })))
    .onConflictDoNothing({ target: [jobOffer.userId, jobOffer.source, jobOffer.externalId] })
    .returning({ id: jobOffer.id });
  return inserted.length;
}

export async function runSavedSearch(userId: string, searchId: string, source: JobSource, db: Db = defaultDb) {
  const [s] = await db
    .select()
    .from(savedSearch)
    .where(and(eq(savedSearch.userId, userId), eq(savedSearch.id, searchId)))
    .limit(1);
  if (!s) throw new NotFoundError("Saved search");
  try {
    const { offers, invalid } = await source.search({
      romeCodes: s.romeCodes,
      departements: s.departements,
      diplomaLevel: s.diplomaLevel,
    });
    const added = await ingestOffers(userId, s.id, "lba", offers, db);
    await db.update(savedSearch).set({ lastRunAt: new Date(), lastError: null }).where(eq(savedSearch.id, s.id));
    if (invalid) log.warn("discovery.invalid_offers", { searchId: s.id, invalid });
    return { found: offers.length, added };
  } catch (err) {
    await db
      .update(savedSearch)
      .set({ lastRunAt: new Date(), lastError: err instanceof Error ? err.message.slice(0, 200) : "error" })
      .where(eq(savedSearch.id, s.id));
    log.error("discovery.search_failed", { searchId: s.id, ...errorFields(err) });
    throw err;
  }
}

/** "Run now" from the UI: limited so one user can't exhaust the shared API quota. */
export async function runSavedSearchNow(userId: string, searchId: string, source: JobSource, db: Db = defaultDb) {
  if (!(await consumeRateLimit(`discover:${userId}`, 6, 3600, db))) throw new RateLimitError();
  return runSavedSearch(userId, searchId, source, db);
}

/**
 * Scheduled run: every search not run in the last 20 h, one at a time with a
 * pause between calls to stay under the API's 60 calls/minute.
 */
export async function runDueSearches(
  source: JobSource,
  opts: { now?: Date; limit?: number; pauseMs?: number } = {},
  db: Db = defaultDb,
) {
  const now = opts.now ?? new Date();
  const due = await db
    .select({ id: savedSearch.id, userId: savedSearch.userId })
    .from(savedSearch)
    .where(or(isNull(savedSearch.lastRunAt), lt(savedSearch.lastRunAt, new Date(now.getTime() - RERUN_AFTER_MS))))
    .orderBy(asc(savedSearch.lastRunAt))
    .limit(opts.limit ?? 50);
  let added = 0;
  let failed = 0;
  for (const [i, s] of due.entries()) {
    if (i > 0 && opts.pauseMs !== 0) await new Promise((r) => setTimeout(r, opts.pauseMs ?? 1100));
    try {
      added += (await runSavedSearch(s.userId, s.id, source, db)).added;
    } catch {
      failed++;
    }
  }
  return { searches: due.length, added, failed };
}

export async function listOffers(userId: string, state: "new" | "added" | "dismissed", db: Db = defaultDb) {
  return db
    .select()
    .from(jobOffer)
    .where(and(eq(jobOffer.userId, userId), eq(jobOffer.state, state)))
    .orderBy(desc(jobOffer.publishedAt), desc(jobOffer.createdAt))
    .limit(100);
}

export async function offerCounts(userId: string, db: Db = defaultDb) {
  const rows = await db
    .select({ state: jobOffer.state, n: count() })
    .from(jobOffer)
    .where(eq(jobOffer.userId, userId))
    .groupBy(jobOffer.state);
  return { new: 0, added: 0, dismissed: 0, ...Object.fromEntries(rows.map((r) => [r.state, r.n])) };
}

/**
 * Turns an offer into an application in the user's pipeline. Idempotent: a
 * second call (double tap in Telegram) returns the same application.
 */
export async function addOfferToPipeline(userId: string, offerId: string, db: Db = defaultDb): Promise<string> {
  return db.transaction(async (tx) => {
    const [o] = await tx
      .select()
      .from(jobOffer)
      .where(and(eq(jobOffer.userId, userId), eq(jobOffer.id, offerId)))
      .for("update");
    if (!o) throw new NotFoundError("Offer");
    if (o.state === "added" && o.applicationId) return o.applicationId;
    const input = applicationInput.parse({
      title: o.title,
      // An offer without an employer name stays honest about it.
      companyName: o.company ?? "Unspecified company",
      jobUrl: o.url ?? "",
      location: o.location ?? "",
      workMode: o.workMode ?? "",
      employmentType: o.contractTypes?.toLowerCase().includes("apprentissage") ? "apprenticeship" : "",
      source: o.source === "lba" ? "La Bonne Alternance" : "Sample",
      description: o.description ?? "",
      status: "saved",
    });
    // Nested transaction = savepoint: the offer and the application commit together.
    const appId = await createApplication(userId, input, tx as unknown as Db);
    await tx.update(jobOffer).set({ state: "added", applicationId: appId }).where(eq(jobOffer.id, o.id));
    return appId;
  });
}

export async function setOfferDismissed(userId: string, offerId: string, dismissed: boolean, db: Db = defaultDb) {
  const res = await db
    .update(jobOffer)
    .set({ state: dismissed ? "dismissed" : "new" })
    .where(and(eq(jobOffer.userId, userId), eq(jobOffer.id, offerId), or(eq(jobOffer.state, "new"), eq(jobOffer.state, "dismissed"))))
    .returning({ id: jobOffer.id });
  if (!res[0]) throw new NotFoundError("Offer");
}

/** Demo only: clearly-labelled sample offers so the Discover page can be explored. */
export async function seedSampleOffers(userId: string, now = new Date(), db: Db = defaultDb) {
  const day = 864e5;
  const samples: DiscoveredOffer[] = [
    { externalId: "s1", title: "Développeur web full-stack en alternance", company: "Atelier Numérique (exemple)", location: "34000 Montpellier", url: null, contractTypes: "Apprentissage", workMode: "hybrid", description: "Offre d'exemple pour la démo.", publishedAt: new Date(now.getTime() - day) },
    { externalId: "s2", title: "Administrateur systèmes et réseaux — alternance", company: "Réseau Sud (exemple)", location: "31000 Toulouse", url: null, contractTypes: "Apprentissage", workMode: "onsite", description: "Offre d'exemple pour la démo.", publishedAt: new Date(now.getTime() - 2 * day) },
    { externalId: "s3", title: "Technicien support informatique", company: "Helpdesk Pro (exemple)", location: "69002 Lyon", url: null, contractTypes: "Professionnalisation", workMode: "onsite", description: "Offre d'exemple pour la démo.", publishedAt: new Date(now.getTime() - 3 * day) },
  ];
  await ingestOffers(userId, null, "sample", samples, db);
}
