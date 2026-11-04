import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { db as defaultDb, type Db } from "@/server/db";
import { application, document } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import { storage } from "@/server/storage";
import { MAX_UPLOAD_BYTES, sniffType } from "@/lib/files";
import type { documentInput } from "@/lib/validation";

export async function uploadDocument(
  userId: string,
  meta: z.infer<typeof documentInput>,
  bytes: Uint8Array,
  db: Db = defaultDb,
) {
  if (bytes.byteLength === 0) throw new ValidationError({ file: "noFile" });
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ValidationError({ file: "tooLarge" });
  const type = sniffType(bytes);
  if (!type) throw new ValidationError({ file: "badType" });

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `${userId}/${randomUUID()}`;
  // Write the object first: an orphaned object is harmless, a row pointing at
  // a missing object is a broken download.
  await storage().put(key, bytes, type.mime);
  try {
    // Version = how many live documents of this kind and title already exist + 1.
    const [row] = await db
      .insert(document)
      .values({
        userId,
        kind: meta.kind,
        title: meta.title,
        targetRole: meta.targetRole ?? null,
        storageKey: key,
        mimeType: type.mime,
        sizeBytes: bytes.byteLength,
        sha256,
        version: sql`(select count(*) + 1 from ${document} d where d.user_id = ${userId} and d.kind = ${meta.kind} and lower(d.title) = lower(${meta.title}) and d.deleted_at is null)`,
      })
      .returning({ id: document.id });
    return row?.id;
  } catch (err) {
    await storage().delete(key).catch(() => undefined);
    throw err;
  }
}

export async function listDocuments(userId: string, db: Db = defaultDb) {
  return db
    .select({
      id: document.id,
      kind: document.kind,
      title: document.title,
      targetRole: document.targetRole,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      version: document.version,
      createdAt: document.createdAt,
    })
    .from(document)
    .where(and(eq(document.userId, userId), isNull(document.deletedAt)))
    .orderBy(desc(document.createdAt))
    .limit(500);
}

export async function resumeOptions(userId: string, db: Db = defaultDb) {
  return db
    .select({ id: document.id, title: document.title, version: document.version })
    .from(document)
    .where(and(eq(document.userId, userId), eq(document.kind, "resume"), isNull(document.deletedAt)))
    .orderBy(desc(document.createdAt));
}

/** Returns bytes only for the owner. Same error for missing and foreign ids. */
export async function readDocument(userId: string, id: string, db: Db = defaultDb) {
  const rows = await db
    .select()
    .from(document)
    .where(and(eq(document.userId, userId), eq(document.id, id), isNull(document.deletedAt)))
    .limit(1);
  const doc = rows[0];
  if (!doc) throw new NotFoundError("Document");
  const bytes = await storage().get(doc.storageKey);
  return { doc, bytes };
}

/**
 * Soft-deletes the row (keeps the audit trail), detaches it from applications,
 * and removes the object so the file content is actually gone.
 */
export async function deleteDocument(userId: string, id: string, db: Db = defaultDb) {
  const key = await db.transaction(async (tx) => {
    const res = await tx
      .update(document)
      .set({ deletedAt: new Date() })
      .where(and(eq(document.userId, userId), eq(document.id, id), isNull(document.deletedAt)))
      .returning({ key: document.storageKey });
    if (!res[0]) throw new NotFoundError("Document");
    await tx
      .update(application)
      .set({ resumeId: null })
      .where(and(eq(application.userId, userId), eq(application.resumeId, id)));
    return res[0].key;
  });
  await storage().delete(key);
}

/** Every storage key a user owns, including soft-deleted rows. Used on account deletion. */
export async function allStorageKeys(userId: string, db: Db = defaultDb) {
  const rows = await db.select({ key: document.storageKey }).from(document).where(eq(document.userId, userId));
  return rows.map((r) => r.key);
}
