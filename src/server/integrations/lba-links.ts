/**
 * Recognizes La Bonne Alternance links so the bot can use the API instead of
 * scraping a JavaScript-rendered page.
 *
 *   /emploi/recruteurs_lba/<siret>/<company-slug>  → a company that hires
 *       apprentices (spontaneous application), not a job offer
 *   /emploi/<type>/<id>[/<slug>] and /emploi/<id>  → a job offer
 */
export const LBA_HOST = "labonnealternance.apprentissage.beta.gouv.fr";

export type LbaLink =
  | { kind: "recruiter"; siret: string; company: string | null }
  | { kind: "offer"; id: string };

/** "groupe-nicollin" → "Groupe Nicollin". Only a hint: the user can correct it. */
export function companyFromSlug(slug: string | undefined): string | null {
  if (!slug) return null;
  let s: string;
  try {
    s = decodeURIComponent(slug);
  } catch {
    return null;
  }
  const words = s.split(/[-_\s]+/).filter((w) => /^[\p{L}\p{N}&'.]+$/u.test(w));
  if (!words.length) return null;
  return words
    .map((w) => w.charAt(0).toLocaleUpperCase("fr") + w.slice(1))
    .join(" ")
    .slice(0, 120);
}

export function parseLbaUrl(raw: string): LbaLink | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== LBA_HOST) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] !== "emploi") return null;
  if (parts[1] === "recruteurs_lba") {
    const siret = parts[2] ?? "";
    if (!/^\d{14}$/.test(siret)) return null;
    return { kind: "recruiter", siret, company: companyFromSlug(parts[3]) };
  }
  // /emploi/<id> or /emploi/<type>/<id>[/<slug>]
  const id = parts.length === 2 ? parts[1] : parts[2];
  if (!id || !/^[\w-]{6,64}$/.test(id)) return null;
  return { kind: "offer", id };
}
