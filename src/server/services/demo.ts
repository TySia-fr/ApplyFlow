import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/server/db";
import { application, applicationEvent, company, followUp, interview, user } from "@/server/db/schema";
import type { Status } from "@/lib/applications/status";
import { POSITION_GAP } from "@/lib/applications/status";

export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

export function demoCredentials() {
  return {
    email: `demo-${randomUUID()}@demo.applyflow.invalid`, // .invalid is reserved: can never receive mail
    password: randomBytes(24).toString("base64url"),
  };
}

export async function markAsDemo(userId: string, db: Db = defaultDb) {
  await db
    .update(user)
    .set({ isDemo: true, emailVerified: true, demoExpiresAt: new Date(Date.now() + DEMO_TTL_MS), timezone: "Europe/Paris" })
    .where(eq(user.id, userId));
}

type SeedApp = {
  title: string;
  company: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite";
  employmentType: "full_time" | "apprenticeship" | "contract";
  salary?: [number, number];
  source: string;
  priority: "low" | "medium" | "high";
  /** Status path with days-ago for each step, oldest first. */
  path: [Status, number][];
};

// Fictional companies. Any resemblance to real ones is unintended.
const SEED: SeedApp[] = [
  { title: "Full-stack Engineer", company: "Northwind Labs", location: "Paris", workMode: "hybrid", employmentType: "full_time", salary: [48000, 58000], source: "LinkedIn", priority: "high",
    path: [["saved", 40], ["applied", 38], ["screening", 33], ["interview", 28], ["technical_assessment", 22], ["final_interview", 12], ["offer", 4]] },
  { title: "Frontend Developer (React)", company: "Lumen Health", location: "Lyon", workMode: "onsite", employmentType: "full_time", salary: [42000, 50000], source: "Company site", priority: "medium",
    path: [["applied", 35], ["screening", 30], ["interview", 25], ["rejected", 18]] },
  { title: "Backend Engineer, Node.js", company: "Kestrel Data", location: "Remote, EU", workMode: "remote", employmentType: "full_time", salary: [55000, 65000], source: "Referral", priority: "high",
    path: [["applied", 20], ["screening", 15], ["interview", 9]] },
  { title: "Software Engineer Apprentice", company: "Orbital Rail", location: "Montpellier", workMode: "onsite", employmentType: "apprenticeship", source: "La Bonne Alternance", priority: "high",
    path: [["preparing", 14], ["applied", 11], ["screening", 6]] },
  { title: "TypeScript Developer", company: "Fernwood Studio", location: "Bordeaux", workMode: "hybrid", employmentType: "contract", salary: [400, 500], source: "Malt", priority: "medium",
    path: [["applied", 26], ["rejected", 19]] },
  { title: "Platform Engineer", company: "Kestrel Data", location: "Remote, EU", workMode: "remote", employmentType: "full_time", source: "Company site", priority: "low",
    path: [["applied", 16]] },
  { title: "Junior Full-stack Developer", company: "Copperleaf", location: "Toulouse", workMode: "hybrid", employmentType: "full_time", salary: [36000, 42000], source: "Welcome to the Jungle", priority: "medium",
    path: [["applied", 9]] },
  { title: "React Native Developer", company: "Tidepool Mobility", location: "Nantes", workMode: "hybrid", employmentType: "full_time", source: "LinkedIn", priority: "low",
    path: [["saved", 6], ["withdrawn", 3]] },
  { title: "Next.js Engineer", company: "Brightline Commerce", location: "Paris", workMode: "remote", employmentType: "full_time", salary: [50000, 60000], source: "LinkedIn", priority: "high",
    path: [["preparing", 3]] },
  { title: "Developer Experience Engineer", company: "Quartz Cloud", location: "Remote", workMode: "remote", employmentType: "full_time", source: "Hacker News", priority: "medium",
    path: [["interested", 1]] },
];

const day = 24 * 60 * 60 * 1000;

export async function seedDemoData(userId: string, now = new Date(), db: Db = defaultDb) {
  await db.transaction(async (tx) => {
    const companyIds = new Map<string, string>();
    for (const name of new Set(SEED.map((s) => s.company))) {
      const [c] = await tx.insert(company).values({ userId, name }).returning({ id: company.id });
      if (c) companyIds.set(name, c.id);
    }
    const positions = new Map<Status, number>();
    const ids: Record<string, string> = {};
    for (const s of SEED) {
      const first = s.path[0];
      const last = s.path[s.path.length - 1];
      if (!first || !last) continue;
      const status = last[0];
      const position = (positions.get(status) ?? 0) + POSITION_GAP;
      positions.set(status, position);
      const created = new Date(now.getTime() - first[1] * day);
      const appliedStep = s.path.find(([st]) => st === "applied");
      const [a] = await tx
        .insert(application)
        .values({
          userId,
          companyId: companyIds.get(s.company) as string,
          title: s.title,
          status,
          position,
          priority: s.priority,
          location: s.location,
          country: "France",
          workMode: s.workMode,
          employmentType: s.employmentType,
          salaryMin: s.salary?.[0],
          salaryMax: s.salary?.[1],
          currency: s.salary ? "EUR" : null,
          source: s.source,
          appliedAt: appliedStep ? new Date(now.getTime() - appliedStep[1] * day) : null,
          createdAt: created,
          updatedAt: new Date(now.getTime() - last[1] * day),
        })
        .returning({ id: application.id });
      if (!a) continue;
      ids[s.title] = a.id;
      let from: Status | null = null;
      for (const [to, daysAgo] of s.path) {
        await tx.insert(applicationEvent).values({
          userId,
          applicationId: a.id,
          fromStatus: from,
          toStatus: to,
          occurredAt: new Date(now.getTime() - daysAgo * day),
        });
        from = to;
      }
    }

    const at = (daysFromNow: number, hourUtc: number) => {
      const d = new Date(now.getTime() + daysFromNow * day);
      d.setUTCHours(hourUtc, 0, 0, 0);
      return d;
    };
    const kestrel = ids["Backend Engineer, Node.js"];
    const orbital = ids["Software Engineer Apprentice"];
    const northwind = ids["Full-stack Engineer"];
    const copperleaf = ids["Junior Full-stack Developer"];
    if (kestrel && orbital && northwind && copperleaf) {
      await tx.insert(interview).values([
        { userId, applicationId: kestrel, type: "technical", scheduledAt: at(2, 9), timezone: "Europe/Paris", durationMinutes: 90,
          locationOrUrl: "Video call (link in invitation)", participants: "Two backend engineers",
          preparationNotes: "Review Node streams, Postgres indexing, and the take-home feedback.", questionsToAsk: "How is on-call organised? What does the first 90 days look like?" },
        { userId, applicationId: orbital, type: "video", scheduledAt: at(5, 13), timezone: "Europe/Paris", durationMinutes: 45,
          locationOrUrl: "Video call", participants: "HR and future tutor", preparationNotes: "School rhythm, start date, mobility." },
        { userId, applicationId: northwind, type: "final", scheduledAt: at(-12, 14), timezone: "Europe/Paris", durationMinutes: 60,
          outcome: "passed", feedback: "Good discussion on system design; offer expected within a week." },
      ]);
      await tx.insert(followUp).values([
        { userId, applicationId: copperleaf, title: "Follow up with the recruiter (no reply after 7 days)", dueAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)) },
        { userId, applicationId: northwind, title: "Reply to the offer and ask about start date", dueAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) },
        { userId, applicationId: orbital, title: "Send portfolio link to the tutor", dueAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3)) },
      ]);
    }
  });
}

