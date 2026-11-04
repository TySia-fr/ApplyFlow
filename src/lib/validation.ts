import { z } from "zod";
import { EMPLOYMENT_TYPES, PRIORITIES, STATUSES, WORK_MODES } from "@/lib/applications/status";

/**
 * Server-side input schemas. Every Server Action parses its input with one of
 * these; the client form uses the same schema for instant feedback, but the
 * server never trusts that the client did.
 *
 * Inputs come from FormData, so empty strings mean "not provided".
 */

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z
    .url({ protocol: /^https?$/, message: "Must be an http(s) URL" })
    .max(2048)
    .optional(),
);

const optionalInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(0).max(10_000_000).optional(),
);

/** Accepts `YYYY-MM-DD` from <input type="date">; stored as UTC midnight. */
const optionalDate = z.preprocess(
  emptyToUndefined,
  z.iso
    .date()
    .transform((s) => new Date(`${s}T00:00:00.000Z`))
    .optional(),
);

export const uuidSchema = z.uuid();

export const applicationInput = z
  .object({
    title: z.string().trim().min(1, "Required").max(200),
    companyName: z.string().trim().min(1, "Required").max(200),
    companyWebsite: optionalUrl,
    status: z.enum(STATUSES).default("interested"),
    priority: z.enum(PRIORITIES).default("medium"),
    jobUrl: optionalUrl,
    description: optionalText(20_000),
    location: optionalText(200),
    country: optionalText(100),
    workMode: z.preprocess(emptyToUndefined, z.enum(WORK_MODES).optional()),
    employmentType: z.preprocess(emptyToUndefined, z.enum(EMPLOYMENT_TYPES).optional()),
    salaryMin: optionalInt,
    salaryMax: optionalInt,
    currency: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{3}$/, "3-letter code, e.g. EUR")
        .optional(),
    ),
    source: optionalText(100),
    appliedAt: optionalDate,
    deadline: optionalDate,
    notes: optionalText(10_000),
    resumeId: z.preprocess(emptyToUndefined, z.uuid().optional()),
  })
  .refine((v) => v.salaryMin === undefined || v.salaryMax === undefined || v.salaryMin <= v.salaryMax, {
    message: "Minimum must not exceed maximum",
    path: ["salaryMax"],
  });

export type ApplicationInput = z.infer<typeof applicationInput>;

export const statusChangeInput = z.object({
  applicationId: z.uuid(),
  status: z.enum(STATUSES),
  note: optionalText(1_000),
});

export const moveInput = z.object({
  applicationId: z.uuid(),
  status: z.enum(STATUSES),
  /** Id of the card the moved card should be placed before; absent = bottom. */
  beforeId: z.uuid().optional(),
});

export const listQuery = z.object({
  q: optionalText(100),
  status: z.preprocess(emptyToUndefined, z.enum(STATUSES).optional()),
  priority: z.preprocess(emptyToUndefined, z.enum(PRIORITIES).optional()),
  archived: z.preprocess((v) => v === "1", z.boolean()),
  sort: z.preprocess(
    emptyToUndefined,
    z.enum(["created", "updated", "deadline", "priority"]).default("updated"),
  ),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10_000).default(1)),
});

export type ListQuery = z.infer<typeof listQuery>;

export const INTERVIEW_TYPES = [
  "phone_screen",
  "video",
  "onsite",
  "technical",
  "behavioral",
  "final",
  "other",
] as const;
export const INTERVIEW_OUTCOMES = ["pending", "passed", "failed", "cancelled"] as const;

/** Validates an IANA zone name using the runtime's own tz database. */
export const timezoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Unknown timezone");

export const interviewInput = z.object({
  applicationId: z.uuid(),
  type: z.enum(INTERVIEW_TYPES),
  /** `YYYY-MM-DDTHH:mm` from <input type="datetime-local">, interpreted in `timezone`. */
  localDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid date and time"),
  timezone: timezoneSchema,
  durationMinutes: z.coerce.number().int().min(5).max(600).default(60),
  locationOrUrl: optionalText(500),
  participants: optionalText(500),
  preparationNotes: optionalText(10_000),
  questionsToAsk: optionalText(5_000),
});

export const interviewUpdateInput = z.object({
  interviewId: z.uuid(),
  outcome: z.enum(INTERVIEW_OUTCOMES),
  feedback: optionalText(10_000),
});

export const followUpInput = z.object({
  applicationId: z.preprocess(emptyToUndefined, z.uuid().optional()),
  title: z.string().trim().min(1, "Required").max(300),
  dueDate: z.iso.date(),
});

export const settingsInput = z.object({
  name: z.string().trim().min(1, "Required").max(100),
  locale: z.enum(["en", "fr"]),
  timezone: timezoneSchema,
});

export const DOCUMENT_KINDS = ["resume", "cover_letter", "certificate", "other"] as const;

export const documentInput = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string().trim().min(1, "Required").max(200),
  targetRole: optionalText(200),
});

/** Field errors keyed by field name, for rendering next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
