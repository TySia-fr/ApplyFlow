import "server-only";
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, max, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/server/db";
import { application, applicationEvent, company, document, followUp, interview } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import { POSITION_GAP, type Status } from "@/lib/applications/status";
import type { ApplicationInput, ListQuery } from "@/lib/validation";

export const PAGE_SIZE = 20;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

/** Finds the user's company by case-insensitive name or creates it. Race-safe via the unique index. */
async function upsertCompany(tx: Executor, userId: string, name: string, website?: string): Promise<string> {
  const inserted = await tx
    .insert(company)
    .values({ userId, name, website })
    .onConflictDoNothing()
    .returning({ id: company.id });
  if (inserted[0]) return inserted[0].id;
  const existing = await tx
    .select({ id: company.id, website: company.website })
    .from(company)
    .where(and(eq(company.userId, userId), sql`lower(${company.name}) = lower(${name})`))
    .limit(1);
  const row = existing[0];
  if (!row) throw new Error("Company upsert failed");
  if (website && !row.website) {
    await tx.update(company).set({ website }).where(and(eq(company.userId, userId), eq(company.id, row.id)));
  }
  return row.id;
}

async function assertResumeOwned(tx: Executor, userId: string, resumeId: string | undefined) {
  if (!resumeId) return;
  const rows = await tx
    .select({ id: document.id })
    .from(document)
    .where(and(eq(document.userId, userId), eq(document.id, resumeId), isNull(document.deletedAt)))
    .limit(1);
  // The composite FK would reject a foreign id anyway; this gives a field error instead of a 500.
  if (!rows[0]) throw new ValidationError({ resumeId: "Unknown document" });
}

async function nextPosition(tx: Executor, userId: string, status: Status): Promise<number> {
  const [row] = await tx
    .select({ max: max(application.position) })
    .from(application)
    .where(and(eq(application.userId, userId), eq(application.status, status)));
  return (row?.max ?? 0) + POSITION_GAP;
}

function toRow(input: ApplicationInput) {
  return {
    title: input.title,
    priority: input.priority,
    jobUrl: input.jobUrl ?? null,
    description: input.description ?? null,
    location: input.location ?? null,
    country: input.country ?? null,
    workMode: input.workMode ?? null,
    employmentType: input.employmentType ?? null,
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    currency: input.currency ?? null,
    source: input.source ?? null,
    appliedAt: input.appliedAt ?? null,
    deadline: input.deadline ?? null,
    notes: input.notes ?? null,
    resumeId: input.resumeId ?? null,
  };
}

export async function createApplication(userId: string, input: ApplicationInput, db: Db = defaultDb) {
  return db.transaction(async (tx) => {
    await assertResumeOwned(tx, userId, input.resumeId);
    const companyId = await upsertCompany(tx, userId, input.companyName, input.companyWebsite);
    const position = await nextPosition(tx, userId, input.status);
    const appliedAt = input.appliedAt ?? (input.status === "applied" ? todayUtc() : null);
    const [created] = await tx
      .insert(application)
      .values({ ...toRow(input), appliedAt, userId, companyId, status: input.status, position })
      .returning({ id: application.id });
    if (!created) throw new Error("Insert failed");
    await tx.insert(applicationEvent).values({ userId, applicationId: created.id, fromStatus: null, toStatus: input.status });
    return created.id;
  });
}

export async function updateApplication(userId: string, id: string, input: ApplicationInput, db: Db = defaultDb) {
  await db.transaction(async (tx) => {
    const current = await lockOwned(tx, userId, id);
    await assertResumeOwned(tx, userId, input.resumeId);
    const companyId = await upsertCompany(tx, userId, input.companyName, input.companyWebsite);
    await tx
      .update(application)
      .set({ ...toRow(input), companyId })
      .where(and(eq(application.userId, userId), eq(application.id, id)));
    if (current.status !== input.status) await recordTransition(tx, userId, id, current.status, input.status);
  });
}

/** Row-locks the application so concurrent status changes serialize and history stays consistent. */
async function lockOwned(tx: Tx, userId: string, id: string) {
  const rows = await tx
    .select({ status: application.status, appliedAt: application.appliedAt })
    .from(application)
    .where(and(eq(application.userId, userId), eq(application.id, id)))
    .for("update");
  const row = rows[0];
  if (!row) throw new NotFoundError("Application");
  return row;
}

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

async function recordTransition(tx: Tx, userId: string, id: string, from: Status, to: Status, note?: string) {
  const position = await nextPosition(tx, userId, to);
  await tx
    .update(application)
    .set({
      status: to,
      position,
      // First time it's marked applied, stamp the date unless the user set one.
      ...(to === "applied" ? { appliedAt: sql`coalesce(${application.appliedAt}, ${todayUtc()})` } : {}),
    })
    .where(and(eq(application.userId, userId), eq(application.id, id)));
  await tx.insert(applicationEvent).values({ userId, applicationId: id, fromStatus: from, toStatus: to, note });
}

export async function changeStatus(userId: string, id: string, to: Status, note?: string, db: Db = defaultDb) {
  await db.transaction(async (tx) => {
    const current = await lockOwned(tx, userId, id);
    if (current.status === to) return; // no-op: don't write a fake event
    await recordTransition(tx, userId, id, current.status, to, note);
  });
}

/**
 * Kanban drop. Places the card before `beforeId` in the target column (or at
 * the bottom). Uses the gap between neighbours; when the gap is exhausted the
 * column is renumbered in the same transaction.
 */
export async function moveApplication(
  userId: string,
  id: string,
  to: Status,
  beforeId: string | undefined,
  db: Db = defaultDb,
) {
  await db.transaction(async (tx) => {
    const current = await lockOwned(tx, userId, id);
    if (current.status !== to) {
      await tx.insert(applicationEvent).values({ userId, applicationId: id, fromStatus: current.status, toStatus: to });
    }
    const column = await tx
      .select({ id: application.id, position: application.position })
      .from(application)
      .where(and(eq(application.userId, userId), eq(application.status, to), isNull(application.archivedAt)))
      .orderBy(asc(application.position), asc(application.createdAt));
    const others = column.filter((c) => c.id !== id);
    let index = beforeId ? others.findIndex((c) => c.id === beforeId) : others.length;
    if (index < 0) index = others.length;

    const prev = others[index - 1]?.position;
    const next = others[index]?.position;
    let position: number;
    if (prev === undefined && next === undefined) position = POSITION_GAP;
    else if (prev === undefined) position = (next as number) - POSITION_GAP;
    else if (next === undefined) position = prev + POSITION_GAP;
    else position = Math.floor((prev + next) / 2);

    const collision = (prev !== undefined && position <= prev) || (next !== undefined && position >= next);
    const appliedPatch =
      to === "applied" ? { appliedAt: sql`coalesce(${application.appliedAt}, ${todayUtc()})` } : {};
    if (!collision) {
      await tx
        .update(application)
        .set({ status: to, position, ...appliedPatch })
        .where(and(eq(application.userId, userId), eq(application.id, id)));
      return;
    }
    // Renumber the whole column with fresh gaps.
    const ordered = [...others.slice(0, index).map((c) => c.id), id, ...others.slice(index).map((c) => c.id)];
    for (const [i, cardId] of ordered.entries()) {
      await tx
        .update(application)
        .set({ position: (i + 1) * POSITION_GAP, ...(cardId === id ? { status: to, ...appliedPatch } : {}) })
        .where(and(eq(application.userId, userId), eq(application.id, cardId)));
    }
  });
}

export async function setArchived(userId: string, id: string, archived: boolean, db: Db = defaultDb) {
  const res = await db
    .update(application)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(application.userId, userId), eq(application.id, id)))
    .returning({ id: application.id });
  if (!res[0]) throw new NotFoundError("Application");
}

export async function deleteApplication(userId: string, id: string, db: Db = defaultDb) {
  // Events, interviews and follow-ups cascade through the composite FKs.
  const res = await db
    .delete(application)
    .where(and(eq(application.userId, userId), eq(application.id, id)))
    .returning({ id: application.id });
  if (!res[0]) throw new NotFoundError("Application");
}

export async function duplicateApplication(userId: string, id: string, db: Db = defaultDb) {
  return db.transaction(async (tx) => {
    const [src] = await tx
      .select()
      .from(application)
      .where(and(eq(application.userId, userId), eq(application.id, id)))
      .limit(1);
    if (!src) throw new NotFoundError("Application");
    const position = await nextPosition(tx, userId, "interested");
    const [copy] = await tx
      .insert(application)
      .values({
        userId,
        companyId: src.companyId,
        resumeId: src.resumeId,
        priority: src.priority,
        jobUrl: src.jobUrl,
        description: src.description,
        location: src.location,
        country: src.country,
        workMode: src.workMode,
        employmentType: src.employmentType,
        salaryMin: src.salaryMin,
        salaryMax: src.salaryMax,
        currency: src.currency,
        source: src.source,
        deadline: src.deadline,
        notes: src.notes,
        title: `${src.title} (copy)`, status: "interested", position, appliedAt: null })
      .returning({ id: application.id });
    if (!copy) throw new Error("Insert failed");
    await tx.insert(applicationEvent).values({ userId, applicationId: copy.id, fromStatus: null, toStatus: "interested" });
    return copy.id;
  });
}

const listColumns = {
  id: application.id,
  title: application.title,
  status: application.status,
  priority: application.priority,
  location: application.location,
  workMode: application.workMode,
  deadline: application.deadline,
  appliedAt: application.appliedAt,
  updatedAt: application.updatedAt,
  createdAt: application.createdAt,
  archivedAt: application.archivedAt,
  position: application.position,
  companyName: company.name,
};

export async function listApplications(userId: string, q: ListQuery, db: Db = defaultDb) {
  const filters: SQL[] = [eq(application.userId, userId)];
  filters.push(q.archived ? isNotNull(application.archivedAt) : isNull(application.archivedAt));
  if (q.status) filters.push(eq(application.status, q.status));
  if (q.priority) filters.push(eq(application.priority, q.priority));
  if (q.q) {
    // Escape LIKE wildcards so "%" in a search means a literal percent.
    const term = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(
      or(ilike(application.title, term), ilike(company.name, term), ilike(application.location, term)) as SQL,
    );
  }
  const where = and(...filters);
  const priorityRank = sql`case ${application.priority} when 'high' then 0 when 'medium' then 1 else 2 end`;
  const orderBy = {
    updated: [desc(application.updatedAt)],
    created: [desc(application.createdAt)],
    deadline: [sql`${application.deadline} asc nulls last`, desc(application.updatedAt)],
    priority: [priorityRank, desc(application.updatedAt)],
  }[q.sort];

  const [rows, totalRow] = await Promise.all([
    db
      .select(listColumns)
      .from(application)
      .innerJoin(company, and(eq(company.userId, application.userId), eq(company.id, application.companyId)))
      .where(where)
      .orderBy(...orderBy, desc(application.id))
      .limit(PAGE_SIZE)
      .offset((q.page - 1) * PAGE_SIZE),
    db
      .select({ n: count() })
      .from(application)
      .innerJoin(company, and(eq(company.userId, application.userId), eq(company.id, application.companyId)))
      .where(where),
  ]);
  const total = totalRow[0]?.n ?? 0;
  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type ApplicationListRow = Awaited<ReturnType<typeof listApplications>>["rows"][number];

/** Board: all non-archived applications, ordered within their column. */
export async function listBoard(userId: string, db: Db = defaultDb) {
  return db
    .select(listColumns)
    .from(application)
    .innerJoin(company, and(eq(company.userId, application.userId), eq(company.id, application.companyId)))
    .where(and(eq(application.userId, userId), isNull(application.archivedAt)))
    .orderBy(asc(application.position), asc(application.createdAt))
    .limit(1000);
}

export async function getApplication(userId: string, id: string, db: Db = defaultDb) {
  const rows = await db
    .select({
      app: application,
      companyName: company.name,
      companyWebsite: company.website,
      resumeTitle: document.title,
    })
    .from(application)
    .innerJoin(company, and(eq(company.userId, application.userId), eq(company.id, application.companyId)))
    .leftJoin(
      document,
      and(eq(document.userId, application.userId), eq(document.id, application.resumeId), isNull(document.deletedAt)),
    )
    .where(and(eq(application.userId, userId), eq(application.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Application");

  const [events, interviews, followUps] = await Promise.all([
    db
      .select()
      .from(applicationEvent)
      .where(and(eq(applicationEvent.userId, userId), eq(applicationEvent.applicationId, id)))
      .orderBy(desc(applicationEvent.occurredAt), desc(applicationEvent.id)),
    db
      .select()
      .from(interview)
      .where(and(eq(interview.userId, userId), eq(interview.applicationId, id)))
      .orderBy(asc(interview.scheduledAt)),
    db
      .select()
      .from(followUp)
      .where(and(eq(followUp.userId, userId), eq(followUp.applicationId, id)))
      .orderBy(asc(followUp.dueAt)),
  ]);
  return { ...row, events, interviews, followUps };
}

/** Lightweight options list for selects (follow-up form, etc.). */
export async function applicationOptions(userId: string, db: Db = defaultDb) {
  return db
    .select({ id: application.id, title: application.title, companyName: company.name })
    .from(application)
    .innerJoin(company, and(eq(company.userId, application.userId), eq(company.id, application.companyId)))
    .where(and(eq(application.userId, userId), isNull(application.archivedAt)))
    .orderBy(desc(application.updatedAt))
    .limit(200);
}

