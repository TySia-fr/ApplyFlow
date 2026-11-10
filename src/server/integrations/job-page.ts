import "server-only";

/**
 * Reads a job posting from a page's schema.org JobPosting JSON-LD, the
 * structured data most job boards publish for Google for Jobs. No guessing
 * from titles: if the structured data isn't there, the caller asks the user.
 */
export type ParsedJob = { title: string; company: string | null; location: string | null };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = decodeEntities(v).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

function findJobPosting(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const type = o["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return o;
  return findJobPosting(o["@graph"], depth + 1);
}

function locationOf(jl: unknown): string | null {
  const first = Array.isArray(jl) ? jl[0] : jl;
  if (!first || typeof first !== "object") return null;
  const addr = (first as Record<string, unknown>).address;
  if (typeof addr === "string") return clean(addr);
  if (!addr || typeof addr !== "object") return null;
  const a = addr as Record<string, unknown>;
  const parts = [clean(a.addressLocality), clean(a.addressRegion), clean(a.addressCountry)].filter(Boolean);
  return parts.length ? parts.join(", ").slice(0, 200) : null;
}

export function extractJobPosting(html: string): ParsedJob | null {
  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(m[1] ?? "");
    } catch {
      continue;
    }
    const job = findJobPosting(data);
    if (!job) continue;
    const title = clean(job.title);
    if (!title) continue;
    const org = job.hiringOrganization;
    const company = typeof org === "string" ? clean(org) : clean((org as Record<string, unknown> | undefined)?.name);
    return { title, company, location: locationOf(job.jobLocation) };
  }
  return null;
}

/** First http(s) URL in a message. */
export function firstUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  return m ? m[0].replace(/[).,;!?]+$/, "") : null;
}

/** "Title @ Company" (also accepts " - " or " chez " / " at "). */
export function parseTitleCompany(text: string): { title: string; company: string } | null {
  const m = /^\s*(.{2,200}?)\s+(?:@|chez|at|-|—)\s+(.{1,200}?)\s*$/i.exec(text);
  if (!m?.[1] || !m[2]) return null;
  return { title: m[1].trim(), company: m[2].trim() };
}
