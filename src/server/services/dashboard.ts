import "server-only";
import { and, asc, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/server/db";
import { application, applicationEvent, company, followUp, interview } from "@/server/db/schema";
import { computeFunnel, weeklyCounts, type ApplicationHistory } from "@/lib/metrics";
import { STATUSES, type Status } from "@/lib/applications/status";

/**
 * Everything on the dashboard comes from these queries over the user's own
 * rows. Nothing is estimated or padded.
 */
export async function getDashboard(userId: string, now = new Date(), db: Db = defaultDb) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const weeksBack = new Date(now.getTime() - 12 * 7 * 24 * 3600 * 1000);
  const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

  const [histories, thisMonth, created, statusCounts, upcoming, due, recent] = await Promise.all([
    // One row per application with every status it has ever reached.
    db
      .select({
        currentStatus: application.status,
        // ::text[] — node-postgres can't parse arrays of a custom enum type.
        reached: sql<Status[]>`coalesce(array_agg(distinct ${applicationEvent.toStatus}::text) filter (where ${applicationEvent.toStatus} is not null), '{}'::text[])`,
      })
      .from(application)
      .leftJoin(
        applicationEvent,
        and(eq(applicationEvent.userId, application.userId), eq(applicationEvent.applicationId, application.id)),
      )
      .where(eq(application.userId, userId))
      .groupBy(application.id),
    db
      .select({ n: count() })
      .from(application)
      .where(and(eq(application.userId, userId), gte(application.createdAt, monthStart))),
    db
      .select({ createdAt: application.createdAt })
      .from(application)
      .where(and(eq(application.userId, userId), gte(application.createdAt, weeksBack))),
    db
      .select({ status: application.status, n: count() })
      .from(application)
      .where(and(eq(application.userId, userId), isNull(application.archivedAt)))
      .groupBy(application.status),
    db
      .select({
        id: interview.id,
        type: interview.type,
        scheduledAt: interview.scheduledAt,
        timezone: interview.timezone,
        applicationId: application.id,
        title: application.title,
        companyName: company.name,
      })
      .from(interview)
      .innerJoin(application, and(eq(application.userId, interview.userId), eq(application.id, interview.applicationId)))
      .innerJoin(company, and(eq(company.userId, application.userId), eq(company.id, application.companyId)))
      .where(and(eq(interview.userId, userId), gte(interview.scheduledAt, now), eq(interview.outcome, "pending")))
      .orderBy(asc(interview.scheduledAt))
      .limit(5),
    db
      .select({ id: followUp.id, title: followUp.title, dueAt: followUp.dueAt, applicationId: followUp.applicationId })
      .from(followUp)
      .where(and(eq(followUp.userId, userId), isNull(followUp.completedAt), lte(followUp.dueAt, endOfToday)))
      .orderBy(asc(followUp.dueAt))
      .limit(5),
    db
      .select({
        id: applicationEvent.id,
        fromStatus: applicationEvent.fromStatus,
        toStatus: applicationEvent.toStatus,
        occurredAt: applicationEvent.occurredAt,
        applicationId: application.id,
        title: application.title,
        companyName: company.name,
      })
      .from(applicationEvent)
      .innerJoin(
        application,
        and(eq(application.userId, applicationEvent.userId), eq(application.id, applicationEvent.applicationId)),
      )
      .innerJoin(company, and(eq(company.userId, application.userId), eq(company.id, application.companyId)))
      .where(eq(applicationEvent.userId, userId))
      .orderBy(desc(applicationEvent.occurredAt), desc(applicationEvent.id))
      .limit(8),
  ]);

  const funnel = computeFunnel(histories as ApplicationHistory[]);
  const byStatusMap = new Map(statusCounts.map((r) => [r.status, r.n]));
  return {
    funnel,
    thisMonth: thisMonth[0]?.n ?? 0,
    weekly: weeklyCounts(
      created.map((r) => r.createdAt),
      12,
      now,
    ),
    byStatus: STATUSES.map((s) => ({ status: s, count: byStatusMap.get(s) ?? 0 })).filter((r) => r.count > 0),
    upcoming,
    due,
    recent,
  };
}
