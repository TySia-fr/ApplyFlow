import { z } from "zod";

/**
 * Job families users pick from, mapped to ROME codes (France Travail's
 * occupation codes, which La Bonne Alternance searches by). Users never type
 * ROME codes. Kept to codes whose meaning is well established.
 */
export const JOB_FAMILIES = {
  software_dev: ["M1805"],
  it_ops: ["M1810", "M1801"],
  it_support: ["M1802", "I1401"],
  it_project: ["M1806"],
  web_design: ["E1205"],
  marketing: ["M1705"],
  accounting: ["M1203"],
  hr: ["M1503"],
} as const;

export type JobFamily = keyof typeof JOB_FAMILIES;
export const JOB_FAMILY_KEYS = Object.keys(JOB_FAMILIES) as JobFamily[];

export function romeCodesFor(families: readonly JobFamily[]): string[] {
  return [...new Set(families.flatMap((f) => JOB_FAMILIES[f]))];
}

export function familiesFor(romes: readonly string[]): JobFamily[] {
  return JOB_FAMILY_KEYS.filter((f) => JOB_FAMILIES[f].every((r) => romes.includes(r)));
}

/** European qualification levels as La Bonne Alternance uses them. */
export const DIPLOMA_LEVELS = [3, 4, 5, 6, 7] as const;

/** French département codes: 01–95, 2A/2B (Corsica), 971–976 (overseas). */
const DEPARTEMENT = /^(0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/;

export function parseDepartements(input: string): string[] | null {
  const parts = [...new Set(input.toUpperCase().split(/[\s,;]+/).filter(Boolean))].map((p) => (p.length === 1 ? `0${p}` : p));
  if (parts.length === 0 || parts.length > 10) return null;
  return parts.every((p) => DEPARTEMENT.test(p)) ? parts : null;
}

export const savedSearchInput = z.object({
  name: z.string().trim().min(1, "Required").max(80),
  families: z.array(z.enum(JOB_FAMILY_KEYS as [JobFamily, ...JobFamily[]])).min(1, "Required").max(8),
  departements: z.string().transform((s, ctx) => {
    const parsed = parseDepartements(s);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: "Invalid departements" });
      return z.NEVER;
    }
    return parsed;
  }),
  diplomaLevel: z.coerce.number().int().refine((n) => (DIPLOMA_LEVELS as readonly number[]).includes(n)),
  notifyTelegram: z.preprocess((v) => v === "on" || v === "1" || v === true, z.boolean()),
});

export type SavedSearchInput = z.infer<typeof savedSearchInput>;
