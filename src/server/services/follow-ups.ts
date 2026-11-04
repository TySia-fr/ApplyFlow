import "server-only";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { z } from "zod";
import { db as defaultDb, type Db } from "@/server/db";
import { application, company, followUp } from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import type { followUpInput } from "@/lib/validation";

export async function createFollowUp(userId: string, input: z.infer<typeof followUpInput>, db: Db = defaultDb) {
  if (input.applicationId) {
    const owned = await db
      .select({ id: application.id })
      .from(application)
      .where(and(eq(application.userId, userId), eq(application.id, input.applicationId)))
      .limit(1);
    if (!owned[0]) throw new NotFoundError("Application");
  }
  // A follow-up is due on a calendar day; stored as that day at 00:00 UTC.
  const [row] = await db
    .insert(followUp)
    .values({
      userId,
      applicationId: input.applicationId ?? null,
      title: input.title,
      dueAt: new Date(`${input.dueDate}T00:00:00.000Z`),
    })
    .returning({ id: followUp.id });
  return row?.id;
}

export async function setFollowUpDone(userId: string, id: string, done: boolean, db: Db = defaultDb) {
  const res = await db
    .update(followUp)
    .set({ completedAt: done ? new Date() : null })
    .where(and(eq(followUp.userId, userId), eq(followUp.id, id)))
    .returning({ applicationId: followUp.applicationId });
  if (!res[0]) throw new NotFoundError("Follow-up");
  return res[0].applicationId;
}

export async function deleteFollowUp(userId: string, id: string, db: Db = defaultDb) {
  const res = await db
    .delete(followUp)
    .where(and(eq(followUp.userId, userId), eq(followUp.id, id)))
    .returning({ applicationId: followUp.applicationId });
  if (!res[0]) throw new NotFoundError("Follow-up");
  return res[0].applicationId;
}

export async function listFollowUps(userId: string, db: Db = defaultDb) {
  const cols = {
    id: followUp.id,
    title: followUp.title,
    dueAt: followUp.dueAt,
    completedAt: followUp.completedAt,
    applicationId: followUp.applicationId,
    applicationTitle: application.title,
    companyName: company.name,
  };
  const q = () =>
    db
      .select(cols)
      .from(followUp)
      .leftJoin(application, and(eq(application.userId, followUp.userId), eq(application.id, followUp.applicationId)))
      .leftJoin(company, and(eq(company.userId, application.userId), eq(company.id, application.companyId)));
  const [open, done] = await Promise.all([
    q().where(and(eq(followUp.userId, userId), isNull(followUp.completedAt))).orderBy(asc(followUp.dueAt)).limit(200),
    q()
      .where(and(eq(followUp.userId, userId), isNotNull(followUp.completedAt)))
      .orderBy(desc(followUp.completedAt))
      .limit(30),
  ]);
  return { open, done };
}

export type FollowUpRow = Awaited<ReturnType<typeof listFollowUps>>["open"][number];
