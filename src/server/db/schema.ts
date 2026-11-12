import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Conventions
 * - Every user-owned table has `user_id` and is indexed by it first: every query
 *   in the app is scoped to the current user, so (user_id, ...) is the access path.
 * - Cross-table references between user-owned rows use composite FKs
 *   (user_id, id). This makes it impossible at the database level for user A's
 *   application to point at user B's company or document, even if an
 *   authorization check in application code is forgotten (defense in depth).
 * - All timestamps are `timestamptz` and stored in UTC. Display timezone is a
 *   user preference.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ─── Auth (shape required by better-auth) ───────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  // Demo sandbox accounts: created by "Try the demo", deleted by a cleanup job.
  isDemo: boolean("is_demo").notNull().default(false),
  demoExpiresAt: timestamp("demo_expires_at", { withTimezone: true }),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// Persistent rate-limit storage so limits survive restarts and work across instances.
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// App-level limits (demo creation). Separate from better-auth's table on
// purpose: that one has two unique indexes (id and key), and ON CONFLICT can
// arbitrate only one, so concurrent upserts there can still fail.
export const appRateLimit = pgTable("app_rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
});

// ─── Domain ─────────────────────────────────────────────────────────────────

export const applicationStatus = pgEnum("application_status", [
  "interested",
  "saved",
  "preparing",
  "applied",
  "screening",
  "interview",
  "technical_assessment",
  "final_interview",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
]);

export const workMode = pgEnum("work_mode", ["remote", "hybrid", "onsite"]);
export const employmentType = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "apprenticeship",
  "freelance",
]);
export const priority = pgEnum("priority", ["low", "medium", "high"]);
export const interviewType = pgEnum("interview_type", [
  "phone_screen",
  "video",
  "onsite",
  "technical",
  "behavioral",
  "final",
  "other",
]);
export const interviewOutcome = pgEnum("interview_outcome", [
  "pending",
  "passed",
  "failed",
  "cancelled",
]);
export const documentKind = pgEnum("document_kind", [
  "resume",
  "cover_letter",
  "certificate",
  "other",
]);

export const company = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website"),
    industry: text("industry"),
    location: text("location"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    unique("company_user_id_uq").on(t.userId, t.id),
    // Case-insensitive dedupe per user, enforced by the DB, not by hope.
    uniqueIndex("company_user_name_uq").on(t.userId, sql`lower(${t.name})`),
  ],
);

export const document = pgTable(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: documentKind("kind").notNull(),
    title: text("title").notNull(),
    targetRole: text("target_role"),
    // Object key in S3-compatible storage. Never a public URL.
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("document_user_id_uq").on(t.userId, t.id),
    index("document_user_kind_idx").on(t.userId, t.kind),
    check("document_size_ck", sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 10485760`),
  ],
);

export const application = pgTable(
  "application",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull(),
    resumeId: uuid("resume_id"),
    title: text("title").notNull(),
    status: applicationStatus("status").notNull().default("interested"),
    // Gap-based ordering inside a Kanban column (steps of 1024) so a drag
    // usually rewrites one row, not the whole column.
    position: integer("position").notNull().default(0),
    priority: priority("priority").notNull().default("medium"),
    jobUrl: text("job_url"),
    description: text("description"),
    location: text("location"),
    country: text("country"),
    workMode: workMode("work_mode"),
    employmentType: employmentType("employment_type"),
    // Whole currency units; ranges do not need cent precision.
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    currency: text("currency"),
    source: text("source"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    deadline: timestamp("deadline", { withTimezone: true }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("application_user_id_uq").on(t.userId, t.id),
    foreignKey({
      name: "application_company_owner_fk",
      columns: [t.userId, t.companyId],
      foreignColumns: [company.userId, company.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "application_resume_owner_fk",
      columns: [t.userId, t.resumeId],
      foreignColumns: [document.userId, document.id],
    }),
    index("application_user_status_idx").on(t.userId, t.status, t.position),
    index("application_user_created_idx").on(t.userId, t.createdAt),
    index("application_user_deadline_idx").on(t.userId, t.deadline),
    check(
      "application_salary_ck",
      sql`${t.salaryMin} IS NULL OR ${t.salaryMax} IS NULL OR ${t.salaryMin} <= ${t.salaryMax}`,
    ),
  ],
);

// Append-only history. Never updated, never deleted except by user deletion.
export const applicationEvent = pgTable(
  "application_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    applicationId: uuid("application_id").notNull(),
    fromStatus: applicationStatus("from_status"),
    toStatus: applicationStatus("to_status").notNull(),
    note: text("note"),
    // clock_timestamp(), not now(): now() is the transaction START time, so a
    // transition that waited on the row lock would sort before the one it
    // waited for. clock_timestamp() is read after the lock is acquired.
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  },
  (t) => [
    foreignKey({
      name: "application_event_owner_fk",
      columns: [t.userId, t.applicationId],
      foreignColumns: [application.userId, application.id],
    }).onDelete("cascade"),
    index("application_event_app_idx").on(t.applicationId, t.occurredAt),
    index("application_event_user_idx").on(t.userId, t.occurredAt),
  ],
);

export const interview = pgTable(
  "interview",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    applicationId: uuid("application_id").notNull(),
    type: interviewType("type").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    // IANA zone the interview was scheduled in, so "10:00 Paris" stays 10:00 Paris.
    timezone: text("timezone").notNull(),
    locationOrUrl: text("location_or_url"),
    participants: text("participants"),
    preparationNotes: text("preparation_notes"),
    questionsToAsk: text("questions_to_ask"),
    feedback: text("feedback"),
    outcome: interviewOutcome("outcome").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "interview_owner_fk",
      columns: [t.userId, t.applicationId],
      foreignColumns: [application.userId, application.id],
    }).onDelete("cascade"),
    index("interview_user_scheduled_idx").on(t.userId, t.scheduledAt),
    check("interview_duration_ck", sql`${t.durationMinutes} BETWEEN 5 AND 600`),
  ],
);

export const followUp = pgTable(
  "follow_up",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id"),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "follow_up_owner_fk",
      columns: [t.userId, t.applicationId],
      foreignColumns: [application.userId, application.id],
    }).onDelete("cascade"),
    // Partial index: "what's open and due" is the only hot query.
    index("follow_up_open_due_idx")
      .on(t.userId, t.dueAt)
      .where(sql`${t.completedAt} IS NULL`),
  ],
);

// ─── Job discovery ──────────────────────────────────────────────────────────

export const offerState = pgEnum("offer_state", ["new", "added", "dismissed"]);

/** A saved La Bonne Alternance query, run daily and on demand. */
export const savedSearch = pgTable(
  "saved_search",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    romeCodes: text("rome_codes").array().notNull(),
    departements: text("departements").array().notNull(),
    diplomaLevel: integer("diploma_level").notNull(),
    notifyTelegram: boolean("notify_telegram").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    unique("saved_search_user_id_uq").on(t.userId, t.id),
    index("saved_search_user_idx").on(t.userId),
    check("saved_search_level_ck", sql`${t.diplomaLevel} BETWEEN 3 AND 7`),
    check("saved_search_romes_ck", sql`cardinality(${t.romeCodes}) BETWEEN 1 AND 10`),
    check("saved_search_deps_ck", sql`cardinality(${t.departements}) BETWEEN 1 AND 10`),
  ],
);

/**
 * An offer found for a user. Deduplicated per user by (source, external_id):
 * the same offer seen by two saved searches, or on two days, is one row.
 */
export const jobOffer = pgTable(
  "job_offer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    savedSearchId: uuid("saved_search_id"),
    // "lba" for La Bonne Alternance; "sample" for clearly-labelled demo data.
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    company: text("company"),
    location: text("location"),
    url: text("url"),
    contractTypes: text("contract_types"),
    workMode: workMode("work_mode"),
    description: text("description"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    state: offerState("state").notNull().default("new"),
    applicationId: uuid("application_id"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("job_offer_user_id_uq").on(t.userId, t.id),
    unique("job_offer_dedupe_uq").on(t.userId, t.source, t.externalId),
    foreignKey({
      name: "job_offer_search_owner_fk",
      columns: [t.userId, t.savedSearchId],
      foreignColumns: [savedSearch.userId, savedSearch.id],
    }).onDelete("set null"),
    foreignKey({
      name: "job_offer_application_owner_fk",
      columns: [t.userId, t.applicationId],
      foreignColumns: [application.userId, application.id],
    }).onDelete("set null"),
    index("job_offer_user_state_idx").on(t.userId, t.state, t.createdAt),
  ],
);

// ─── Telegram ───────────────────────────────────────────────────────────────

/** One Telegram chat per user and one user per chat. */
export const telegramLink = pgTable("telegram_link", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  chatId: bigint("chat_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  // A link the bot couldn't read, waiting for "Title @ Company".
  pendingUrl: text("pending_url"),
  // Company already known from the link (LBA company pages): only the title is asked.
  pendingCompany: text("pending_company"),
  pendingAt: timestamp("pending_at", { withTimezone: true }),
  ...timestamps,
});

/** One-time account-linking tokens. Only a SHA-256 hash is stored. */
export const telegramLinkToken = pgTable(
  "telegram_link_token",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("telegram_link_token_user_idx").on(t.userId)],
);

/** Every scheduled message sent, so a reminder is never sent twice. */
export const sentNotification = pgTable(
  "sent_notification",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
