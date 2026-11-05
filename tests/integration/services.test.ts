import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { application, applicationEvent, company, document, user } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import * as apps from "@/server/services/applications";
import * as interviews from "@/server/services/interviews";
import * as followUps from "@/server/services/follow-ups";
import * as docs from "@/server/services/documents";
import { getDashboard } from "@/server/services/dashboard";
import { consumeRateLimit, deleteAccount, purgeExpiredDemos } from "@/server/services/account";
import { seedDemoData } from "@/server/services/demo";
import { applicationInput } from "@/lib/validation";

async function makeUser(extra: Partial<typeof user.$inferInsert> = {}) {
  const id = randomUUID();
  await db.insert(user).values({ id, name: "T", email: `${id}@example.test`, ...extra });
  return id;
}

const input = (over: Record<string, unknown> = {}) =>
  applicationInput.parse({ title: "Engineer", companyName: "Acme", ...over });

const eventsOf = (userId: string, appId: string) =>
  db
    .select()
    .from(applicationEvent)
    .where(and(eq(applicationEvent.userId, userId), eq(applicationEvent.applicationId, appId)))
    .orderBy(applicationEvent.occurredAt);

let A: string;
let B: string;

beforeEach(async () => {
  A = await makeUser();
  B = await makeUser();
});

afterAll(async () => {
  await db.execute(sql`delete from "user" where email like '%@example.test'`);
});

describe("authorization: user B can never touch user A's data", () => {
  it("rejects every application operation with NotFound, and A's row is unchanged", async () => {
    const id = await apps.createApplication(A, input());
    await expect(apps.getApplication(B, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(apps.updateApplication(B, id, input({ title: "pwned" }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(apps.changeStatus(B, id, "offer")).rejects.toBeInstanceOf(NotFoundError);
    await expect(apps.moveApplication(B, id, "offer", undefined)).rejects.toBeInstanceOf(NotFoundError);
    await expect(apps.setArchived(B, id, true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(apps.duplicateApplication(B, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(apps.deleteApplication(B, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      interviews.createInterview(B, { applicationId: id, type: "video", localDateTime: "2030-01-01T10:00", timezone: "UTC", durationMinutes: 60 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(followUps.createFollowUp(B, { applicationId: id, title: "x", dueDate: "2030-01-01" })).rejects.toBeInstanceOf(NotFoundError);

    const a = await apps.getApplication(A, id);
    expect(a.app.title).toBe("Engineer");
    expect(a.app.status).toBe("interested");
    expect(a.app.archivedAt).toBeNull();
    expect((await apps.listApplications(B, { archived: false, sort: "updated", page: 1 })).total).toBe(0);
  });

  it("rejects using another user's document as a resume", async () => {
    const pdf = new Uint8Array(await readFile(path.join(__dirname, "../fixtures/resume.pdf")));
    const docId = (await docs.uploadDocument(A, { kind: "resume", title: "A's CV" }, pdf)) as string;
    await expect(apps.createApplication(B, input({ resumeId: docId }))).rejects.toBeInstanceOf(ValidationError);
    await expect(docs.readDocument(B, docId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(docs.deleteDocument(B, docId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await docs.readDocument(A, docId)).bytes).toEqual(pdf);
  });

  it("rejects interview and follow-up mutations across users", async () => {
    const id = await apps.createApplication(A, input());
    const iv = (await interviews.createInterview(A, { applicationId: id, type: "video", localDateTime: "2030-01-01T10:00", timezone: "UTC", durationMinutes: 60 })) as string;
    const fu = (await followUps.createFollowUp(A, { applicationId: id, title: "x", dueDate: "2030-01-01" })) as string;
    await expect(interviews.updateInterviewOutcome(B, { interviewId: iv, outcome: "failed" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(interviews.deleteInterview(B, iv)).rejects.toBeInstanceOf(NotFoundError);
    await expect(followUps.setFollowUpDone(B, fu, true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(followUps.deleteFollowUp(B, fu)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("status history", () => {
  it("records creation and every transition, and ignores no-op changes", async () => {
    const id = await apps.createApplication(A, input());
    await apps.changeStatus(A, id, "applied", "sent via site");
    await apps.changeStatus(A, id, "applied"); // no-op
    // First move to "applied" stamps the applied date.
    expect((await apps.getApplication(A, id)).app.appliedAt).not.toBeNull();
    await apps.updateApplication(A, id, input({ status: "screening" }));
    const ev = await eventsOf(A, id);
    expect(ev.map((e) => [e.fromStatus, e.toStatus])).toEqual([
      [null, "interested"],
      ["interested", "applied"],
      ["applied", "screening"],
    ]);
    expect(ev[1]?.note).toBe("sent via site");
  });

  it("serializes concurrent status changes (row lock): history stays a valid chain", async () => {
    const id = await apps.createApplication(A, input());
    await Promise.all(
      (["applied", "screening", "interview", "offer", "rejected"] as const).map((s) => apps.changeStatus(A, id, s)),
    );
    const ev = await eventsOf(A, id);
    for (let i = 1; i < ev.length; i++) expect(ev[i]?.fromStatus).toBe(ev[i - 1]?.toStatus);
    expect(ev.at(-1)?.toStatus).toBe((await apps.getApplication(A, id)).app.status);
  });
});

describe("kanban ordering", () => {
  it("places a moved card before the target card and renumbers when gaps run out", async () => {
    const ids: string[] = [];
    for (const t of ["one", "two", "three"]) ids.push(await apps.createApplication(A, input({ title: t, status: "applied" })));
    const [one, two, three] = ids as [string, string, string];
    const order = async () =>
      (await apps.listBoard(A)).filter((r) => r.status === "applied").map((r) => r.title);

    await apps.moveApplication(A, three, "applied", one);
    expect(await order()).toEqual(["three", "one", "two"]);
    // Repeatedly squeeze between the same neighbours to exhaust the gap.
    for (let i = 0; i < 12; i++) {
      await apps.moveApplication(A, i % 2 ? two : one, "applied", three);
      await apps.moveApplication(A, three, "applied", i % 2 ? one : two);
    }
    const final = await apps.listBoard(A);
    const positions = final.filter((r) => r.status === "applied").map((r) => r.position);
    expect(new Set(positions).size).toBe(positions.length); // no ties
  });

  it("moving to another column records a transition", async () => {
    const id = await apps.createApplication(A, input({ status: "applied" }));
    await apps.moveApplication(A, id, "screening", undefined);
    expect((await eventsOf(A, id)).map((e) => e.toStatus)).toEqual(["applied", "screening"]);
  });
});

describe("companies", () => {
  it("dedupes case-insensitively per user but not across users", async () => {
    await apps.createApplication(A, input({ companyName: "Acme" }));
    await apps.createApplication(A, input({ companyName: "ACME" }));
    await apps.createApplication(B, input({ companyName: "acme" }));
    const count = async (u: string) =>
      (await db.select().from(company).where(eq(company.userId, u))).length;
    expect(await count(A)).toBe(1);
    expect(await count(B)).toBe(1);
  });
});

describe("search", () => {
  it("treats LIKE wildcards in the query literally", async () => {
    await apps.createApplication(A, input({ title: "100% remote role" }));
    await apps.createApplication(A, input({ title: "Other" }));
    const q = (s: string) => apps.listApplications(A, { q: s, archived: false, sort: "updated", page: 1 });
    expect((await q("100%")).total).toBe(1);
    expect((await q("%")).total).toBe(1);
    expect((await q("_")).total).toBe(0);
  });
});

describe("documents", () => {
  it("versions by title and detaches deleted resumes from applications", async () => {
    const pdf = new Uint8Array(await readFile(path.join(__dirname, "../fixtures/resume.pdf")));
    const v1 = (await docs.uploadDocument(A, { kind: "resume", title: "CV" }, pdf)) as string;
    const v2 = (await docs.uploadDocument(A, { kind: "resume", title: "cv" }, pdf)) as string;
    const rows = await db.select().from(document).where(eq(document.userId, A));
    expect(rows.find((r) => r.id === v2)?.version).toBe(2);

    const appId = await apps.createApplication(A, input({ resumeId: v1 }));
    await docs.deleteDocument(A, v1);
    expect((await apps.getApplication(A, appId)).app.resumeId).toBeNull();
    await expect(docs.readDocument(A, v1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects disguised and oversized files", async () => {
    await expect(docs.uploadDocument(A, { kind: "resume", title: "x" }, new TextEncoder().encode("<html>"))).rejects.toMatchObject({ fields: { file: "badType" } });
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-"));
    await expect(docs.uploadDocument(A, { kind: "resume", title: "x" }, big)).rejects.toMatchObject({ fields: { file: "tooLarge" } });
  });
});

describe("dashboard", () => {
  it("computes the funnel from seeded history", async () => {
    await seedDemoData(A, new Date());
    const d = await getDashboard(A);
    expect(d.funnel).toMatchObject({ total: 10, submitted: 7, responded: 5, interviewed: 3, offers: 1, rejected: 2 });
    expect(d.upcoming.length).toBe(2);
    expect(d.due.length).toBe(2); // overdue + today
    // B sees none of it.
    expect((await getDashboard(B)).funnel.total).toBe(0);
  });
});

describe("account lifecycle", () => {
  it("deleting an account cascades to every owned row and file", async () => {
    const pdf = new Uint8Array(await readFile(path.join(__dirname, "../fixtures/resume.pdf")));
    const docId = (await docs.uploadDocument(A, { kind: "resume", title: "CV" }, pdf)) as string;
    const [row] = await db.select().from(document).where(eq(document.id, docId));
    await seedDemoData(A, new Date());
    await deleteAccount(A);
    expect(await db.select().from(application).where(eq(application.userId, A))).toHaveLength(0);
    expect(await db.select().from(document).where(eq(document.userId, A))).toHaveLength(0);
    await expect(readFile(path.join(process.env.STORAGE_DIR as string, row?.storageKey as string))).rejects.toThrow();
  });

  it("purges only expired demo accounts", async () => {
    const expired = await makeUser({ isDemo: true, demoExpiresAt: new Date(Date.now() - 1000) });
    const live = await makeUser({ isDemo: true, demoExpiresAt: new Date(Date.now() + 3600_000) });
    await purgeExpiredDemos(1000);
    const ids = (await db.select({ id: user.id }).from(user)).map((r) => r.id);
    expect(ids).not.toContain(expired);
    expect(ids).toContain(live);
    expect(ids).toContain(A); // real users untouched
  });
});

describe("rate limiting", () => {
  it("allows up to max calls per window, atomically under concurrency", async () => {
    const key = `test:${randomUUID()}`;
    // 20 concurrent calls, repeated: previously flaky with a duplicate-key error.
    for (let round = 0; round < 5; round++) {
      const k = `${key}:${round}`;
      const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit(k, 5, 60)));
      expect(results.filter(Boolean)).toHaveLength(5);
    }
  });
});
