import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/server/db";
import { appRateLimit, user } from "@/server/db/schema";
import { storage } from "@/server/storage";
import { allStorageKeys } from "@/server/services/documents";
import { errorFields, log } from "@/server/logger";

export async function updateSettings(
  userId: string,
  input: { name: string; locale: "en" | "fr"; timezone: string },
  db: Db = defaultDb,
) {
  await db.update(user).set(input).where(eq(user.id, userId));
}

/**
 * Deletes the user; every owned row goes with it through ON DELETE CASCADE.
 * Objects are removed after the rows: if that step fails the files are
 * unreachable (no row points at them) and the failure is logged for cleanup.
 */
export async function deleteAccount(userId: string, db: Db = defaultDb) {
  const keys = await allStorageKeys(userId, db);
  await db.delete(user).where(eq(user.id, userId));
  for (const key of keys) {
    await storage()
      .delete(key)
      .catch((err) => log.error("storage.orphan", { key, ...errorFields(err) }));
  }
}

/** Removes expired demo accounts. Bounded so it can run inline on demo creation. */
export async function purgeExpiredDemos(limit = 25, db: Db = defaultDb): Promise<number> {
  const expired = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.isDemo, true), lt(user.demoExpiresAt, new Date())))
    .limit(limit);
  for (const u of expired) await deleteAccount(u.id, db);
  if (expired.length) log.info("demo.purged", { count: expired.length });
  return expired.length;
}

/**
 * Fixed-window counter in Postgres. Atomic: a single upsert on a single
 * primary key either starts a new window or increments the current one.
 * Returns true if the call is allowed.
 */
export async function consumeRateLimit(key: string, max: number, windowSeconds: number, db: Db = defaultDb) {
  const now = Date.now();
  const expired = now - windowSeconds * 1000;
  const [row] = await db
    .insert(appRateLimit)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: appRateLimit.key,
      set: {
        count: sql`case when ${appRateLimit.windowStart} < ${expired} then 1 else ${appRateLimit.count} + 1 end`,
        windowStart: sql`case when ${appRateLimit.windowStart} < ${expired} then ${now} else ${appRateLimit.windowStart} end`,
      },
    })
    .returning({ count: appRateLimit.count });
  return (row?.count ?? 1) <= max;
}
