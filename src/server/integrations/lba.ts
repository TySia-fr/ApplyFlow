import "server-only";
import { z } from "zod";

/**
 * La Bonne Alternance job search (`GET /job/v1/search`).
 * Contract from the official OpenAPI models (mission-apprentissage/api-apprentissage).
 * Auth: `Authorization: Bearer <key>`. Documented limit: 60 calls/min.
 * Terms: free, reserved for non-profit use.
 *
 * Parsing is lenient per field but strict on identity: an offer without an id
 * or title is counted as invalid, never silently dropped or invented.
 */

const optStr = z.string().nullable().catch(null);

const lbaJob = z.object({
  identifier: z.object({ id: optStr, partner_job_id: z.string(), partner_label: z.string().catch("") }),
  workplace: z
    .object({
      name: optStr,
      legal_name: optStr,
      brand: optStr,
      location: z.object({ address: z.string().catch("") }).catch({ address: "" }),
    })
    .catch({ name: null, legal_name: null, brand: null, location: { address: "" } }),
  apply: z.object({ url: z.string().catch("") }).catch({ url: "" }),
  contract: z
    .object({ type: z.array(z.string()).catch([]), remote: z.enum(["onsite", "remote", "hybrid"]).nullable().catch(null) })
    .catch({ type: [], remote: null }),
  offer: z.object({
    title: z.string().min(1),
    description: z.string().catch(""),
    publication: z.object({ creation: optStr }).catch({ creation: null }),
  }),
});

const searchResponse = z.object({ jobs: z.array(z.unknown()) });

export type LbaQuery = { romeCodes: readonly string[]; departements: readonly string[]; diplomaLevel: number };

export type DiscoveredOffer = {
  externalId: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  contractTypes: string | null;
  workMode: "onsite" | "remote" | "hybrid" | null;
  description: string | null;
  publishedAt: Date | null;
};

export interface JobSource {
  search(q: LbaQuery): Promise<{ offers: DiscoveredOffer[]; invalid: number }>;
}

export class LbaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LbaError";
  }
}

function httpUrl(s: string): string | null {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function toOffer(raw: unknown): DiscoveredOffer | null {
  const r = lbaJob.safeParse(raw);
  if (!r.success) return null;
  const j = r.data;
  const created = j.offer.publication.creation ? new Date(j.offer.publication.creation) : null;
  return {
    // Partner id is always present; `id` is LBA's own and may be null for partner offers.
    externalId: `${j.identifier.partner_label || "lba"}:${j.identifier.partner_job_id}`.slice(0, 200),
    title: j.offer.title.slice(0, 200),
    company: (j.workplace.brand || j.workplace.name || j.workplace.legal_name)?.slice(0, 200) ?? null,
    location: j.workplace.location.address.slice(0, 200) || null,
    url: httpUrl(j.apply.url),
    contractTypes: j.contract.type.join(", ").slice(0, 100) || null,
    workMode: j.contract.remote,
    description: j.offer.description.slice(0, 20_000) || null,
    publishedAt: created && !Number.isNaN(created.getTime()) ? created : null,
  };
}

export class LbaClient implements JobSource {
  constructor(
    private readonly opts: { baseUrl: string; apiKey: string; fetch?: typeof fetch },
  ) {}

  async search(q: LbaQuery) {
    const url = new URL(`${this.opts.baseUrl.replace(/\/$/, "")}/job/v1/search`);
    for (const d of q.departements) url.searchParams.append("departements", d);
    url.searchParams.set("romes", q.romeCodes.join(","));
    url.searchParams.set("target_diploma_level", String(q.diplomaLevel));

    const res = await (this.opts.fetch ?? fetch)(url, {
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      // Status and a short reason only: never the key or the full body.
      throw new LbaError(`La Bonne Alternance returned ${res.status}`, res.status);
    }
    const body = searchResponse.parse(await res.json());
    const offers: DiscoveredOffer[] = [];
    let invalid = 0;
    for (const raw of body.jobs) {
      const o = toOffer(raw);
      if (o) offers.push(o);
      else invalid++;
    }
    return { offers, invalid };
  }
}
