import "server-only";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import type { z } from "zod";
import { db as defaultDb, type Db } from "@/server/db";
import { application, company, interview } from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import { zonedTimeToUtc } from "@/lib/time";
import type { interviewInput, interviewUpdateInput } from "@/lib/validation";

export async function createInterview(userId: string, input: z.infer<typeof interviewInput>, db: Db = defaultDb) {
  const owned = await db
    .select({ id: application.id })
    .from(application)
    .where(and(eq(application.userId, userId), eq(application.id, input.applicationId)))
    .limit(1);
  if (!owned[0]) throw new NotFoundError("Application");
  const [row] = await db
    .insert(interview)
    .values({
      userId,
      applicationId: input.applicationId,
      type: input.type,
      scheduledAt: zonedTimeToUtc(input.localDateTime, input.timezone),
      timezone: input.timezone,
      durationMinutes: input.durationMinutes,
      locationOrUrl: input.locationOrUrl,
      participants: input.participants,
      preparationNotes: input.preparationNotes,
      questionsToAsk: input.questionsToAsk,
    })
    .returning({ id: interview.id });
  return row?.id;
}

export async function updateInterviewOutcome(
  userId: string,
  input: z.infer<typeof interviewUpdateInput>,
  db: Db = defaultDb,
) {
  const res = await db
    .update(interview)
    .set({ outcome: input.outcome, feedback: input.feedback ?? null })
    .where(and(eq(interview.userId, userId), eq(interview.id, input.interviewId)))
    .returning({ applicationId: interview.applicationId });
  if (!res[0]) throw new NotFoundError("Interview");
  return res[0].applicationId;
}

export async function deleteInterview(userId: string, id: string, db: Db = defaultDb) {
  const res = await db
    .delete(interview)
    .where(and(eq(interview.userId, userId), eq(interview.id, id)))
    .returning({ applicationId: interview.applicationId });
  if (!res[0]) throw new NotFoundError("Interview");
  return res[0].applicationId;
}

const columns = {
  id: interview.id,
  type: interview.type,
  scheduledAt: interview.scheduledAt,
  timezone: interview.timezone,
  durationMinutes: interview.durationMinutes,
  outcome: interview.outcome,
  locationOrUrl: interview.locationOrUrl,
  applicationId: application.id,
  title: application.title,
  companyName: company.name,
};

function base(db: Db) {
  return db
    .select(columns)
    .from(interview)
    .innerJoin(application, and(eq(application.userId, interview.userId), eq(application.id, interview.applicationId)))
    .innerJoin(company, and(eq(company.userId, application.userId), eq(company.id, application.companyId)));
}

export async function listInterviews(userId: string, now = new Date(), db: Db = defaultDb) {
  const [upcoming, past] = await Promise.all([
    base(db)
      .where(and(eq(interview.userId, userId), gte(interview.scheduledAt, now)))
      .orderBy(asc(interview.scheduledAt))
      .limit(100),
    base(db)
      .where(and(eq(interview.userId, userId), lt(interview.scheduledAt, now)))
      .orderBy(desc(interview.scheduledAt))
      .limit(50),
  ]);
  return { upcoming, past };
}

/** Interviews in [from, to), for the calendar month grid. */
export async function interviewsInRange(userId: string, from: Date, to: Date, db: Db = defaultDb) {
  return base(db)
    .where(and(eq(interview.userId, userId), gte(interview.scheduledAt, from), lt(interview.scheduledAt, to)))
    .orderBy(asc(interview.scheduledAt));
}

export type InterviewRow = Awaited<ReturnType<typeof interviewsInRange>>[number];
