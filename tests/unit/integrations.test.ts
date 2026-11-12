import { describe, expect, it } from "vitest";
import { assertSafeUrl, isPublicIp, UnsafeUrlError } from "@/server/integrations/safe-fetch";
import { extractJobPosting, firstUrl, parseTitleCompany } from "@/server/integrations/job-page";
import { decodeCallback, encodeCallback, esc } from "@/server/integrations/telegram";
import { toOffer } from "@/server/integrations/lba";
import { familiesFor, parseDepartements, romeCodesFor, savedSearchInput } from "@/lib/discovery";

describe("SSRF guard", () => {
  it("classifies private, loopback, link-local, CGNAT and metadata addresses as non-public", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
    for (const ip of ["8.8.8.8", "2.29.5.186", "172.32.0.1", "2a01:4f9:c014:bb47::1", "::ffff:8.8.8.8"]) {
      expect(isPublicIp(ip), ip).toBe(true);
    }
  });

  it("rejects dangerous URLs before any network call", () => {
    for (const u of ["file:///etc/passwd", "gopher://x", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "http://localhost:3000/", "https://user:pw@example.com/", "http://example.com:8080/", "http://db.internal/", "not a url"]) {
      expect(() => assertSafeUrl(u), u).toThrow(UnsafeUrlError);
    }
    expect(assertSafeUrl("https://www.welcometothejungle.com/fr/jobs/1").hostname).toBe("www.welcometothejungle.com");
  });
});

describe("job page parsing", () => {
  const page = (ld: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head></html>`;

  it("reads schema.org JobPosting, including inside @graph, and decodes entities", () => {
    const job = extractJobPosting(
      page({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebPage" },
          {
            "@type": "JobPosting",
            title: "D&eacute;veloppeur &amp; <b>Ops</b>",
            hiringOrganization: { "@type": "Organization", name: "Acme &amp; Co" },
            jobLocation: { "@type": "Place", address: { addressLocality: "Montpellier", addressCountry: "FR" } },
          },
        ],
      }),
    );
    expect(job).toEqual({ title: "D&eacute;veloppeur & Ops", company: "Acme & Co", location: "Montpellier, FR" });
  });

  it("returns null when there is no JobPosting (never guesses from <title>)", () => {
    expect(extractJobPosting("<html><head><title>Senior Dev at X | LinkedIn</title></head></html>")).toBeNull();
    expect(extractJobPosting(page({ "@type": "Organization", name: "X" }))).toBeNull();
    expect(extractJobPosting('<script type="application/ld+json">{broken</script>')).toBeNull();
  });

  it("finds URLs in messages and parses 'Title @ Company'", () => {
    expect(firstUrl("look: https://jobs.example.com/a?b=1).")).toBe("https://jobs.example.com/a?b=1");
    expect(firstUrl("no link here")).toBeNull();
    expect(parseTitleCompany("Développeur web @ Acme")).toEqual({ title: "Développeur web", company: "Acme" });
    expect(parseTitleCompany("Data analyst chez Orange")).toEqual({ title: "Data analyst", company: "Orange" });
    expect(parseTitleCompany("hello")).toBeNull();
  });
});

describe("telegram helpers", () => {
  const id = "6a1c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4";
  it("round-trips callback data within 64 bytes and rejects anything else", () => {
    for (const kind of ["offer_add", "offer_dismiss", "app_applied"] as const) {
      const data = encodeCallback({ kind, id });
      expect(data.length).toBeLessThanOrEqual(64);
      expect(decodeCallback(data)).toEqual({ kind, id });
    }
    expect(decodeCallback("oa:not-a-uuid")).toBeNull();
    expect(decodeCallback(`xx:${id}`)).toBeNull();
    expect(decodeCallback(undefined)).toBeNull();
  });

  it("escapes HTML so offer text can't inject markup", () => {
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href="x"&gt;&amp;&lt;/a&gt;');
  });
});

describe("La Bonne Alternance mapping", () => {
  const raw = {
    identifier: { id: null, partner_job_id: "123", partner_label: "France Travail" },
    workplace: { name: "Acme", legal_name: "ACME SAS", brand: null, location: { address: "34000 Montpellier" } },
    apply: { url: "https://labonnealternance.apprentissage.beta.gouv.fr/emploi/123" },
    contract: { type: ["Apprentissage"], remote: "hybrid" },
    offer: { title: "Développeur", description: "React", publication: { creation: "2026-11-01T09:00:00.000Z" } },
  };
  it("maps an offer with a stable source-scoped id", () => {
    expect(toOffer(raw)).toMatchObject({
      externalId: "France Travail:123",
      title: "Développeur",
      company: "Acme",
      location: "34000 Montpellier",
      contractTypes: "Apprentissage",
      workMode: "hybrid",
    });
  });
  it("drops non-http apply URLs and rejects offers without a title", () => {
    expect(toOffer({ ...raw, apply: { url: "javascript:alert(1)" } })?.url).toBeNull();
    expect(toOffer({ ...raw, offer: { title: "" } })).toBeNull();
  });
});

describe("saved search input", () => {
  it("normalizes départements and rejects invalid ones", () => {
    expect(parseDepartements("34, 30;69")).toEqual(["34", "30", "69"]);
    expect(parseDepartements("2a 971 5")).toEqual(["2A", "971", "05"]);
    expect(parseDepartements("99")).toBeNull();
    expect(parseDepartements("")).toBeNull();
  });
  it("maps job families to ROME codes and back", () => {
    expect(romeCodesFor(["software_dev", "it_support"])).toEqual(["M1805", "M1802", "I1401"]);
    expect(familiesFor(["M1805", "M1802", "I1401"])).toEqual(["software_dev", "it_support"]);
  });
  it("validates the whole form", () => {
    const ok = savedSearchInput.safeParse({ name: "Dev", families: ["software_dev"], departements: "34", diplomaLevel: "6", notifyTelegram: "on" });
    expect(ok.success && ok.data).toMatchObject({ departements: ["34"], diplomaLevel: 6, notifyTelegram: true });
    expect(savedSearchInput.safeParse({ name: "Dev", families: [], departements: "34", diplomaLevel: "6" }).success).toBe(false);
    expect(savedSearchInput.safeParse({ name: "Dev", families: ["x"], departements: "34", diplomaLevel: "6" }).success).toBe(false);
  });
});

import { companyFromSlug, parseLbaUrl } from "@/server/integrations/lba-links";

describe("La Bonne Alternance links", () => {
  it("recognizes a company page (the real link from production)", () => {
    expect(parseLbaUrl("https://labonnealternance.apprentissage.beta.gouv.fr/emploi/recruteurs_lba/78874347400017/lumapps")).toEqual({
      kind: "recruiter",
      siret: "78874347400017",
      company: "Lumapps",
    });
    expect(companyFromSlug("groupe-nicollin")).toBe("Groupe Nicollin");
    expect(companyFromSlug("%C3%A9cole-sup")).toBe("École Sup");
  });
  it("recognizes job offers by id", () => {
    expect(parseLbaUrl("https://labonnealternance.apprentissage.beta.gouv.fr/emploi/offres_emploi_lba/6735a1b2c3d4e5f6a7b8c9d0/dev")).toEqual({ kind: "offer", id: "6735a1b2c3d4e5f6a7b8c9d0" });
    expect(parseLbaUrl("https://labonnealternance.apprentissage.beta.gouv.fr/emploi/6735a1b2c3d4e5f6a7b8c9d0")).toEqual({ kind: "offer", id: "6735a1b2c3d4e5f6a7b8c9d0" });
  });
  it("ignores other hosts, plain http, and malformed paths", () => {
    expect(parseLbaUrl("https://evil.example/emploi/recruteurs_lba/78874347400017/x")).toBeNull();
    expect(parseLbaUrl("http://labonnealternance.apprentissage.beta.gouv.fr/emploi/x123456")).toBeNull();
    expect(parseLbaUrl("https://labonnealternance.apprentissage.beta.gouv.fr/emploi/recruteurs_lba/123/x")).toBeNull();
    expect(parseLbaUrl("https://labonnealternance.apprentissage.beta.gouv.fr/formation/abc123")).toBeNull();
  });
});

import { LbaClient } from "@/server/integrations/lba";

describe("LbaClient.getOffer", () => {
  const job = {
    identifier: { id: "abc", partner_job_id: "abc", partner_label: "La bonne alternance" },
    workplace: { name: "Orbital", legal_name: null, brand: null, location: { address: "Montpellier" } },
    apply: { url: "https://labonnealternance.apprentissage.beta.gouv.fr/emploi/abc" },
    contract: { type: ["Apprentissage"], remote: null },
    offer: { title: "Alternant", description: "", publication: { creation: null } },
  };
  const client = (status: number, body: unknown, seen?: { url?: string; auth?: string }) =>
    new LbaClient({
      baseUrl: "https://api.example/api/",
      apiKey: "k",
      fetch: (async (url: string, init: RequestInit) => {
        if (seen) Object.assign(seen, { url: String(url), auth: (init.headers as Record<string, string>).Authorization });
        return new Response(JSON.stringify(body), { status });
      }) as unknown as typeof fetch,
    });
  it("calls /job/v1/offer/{id} with the bearer key and maps the result", async () => {
    const seen: { url?: string; auth?: string } = {};
    expect(await client(200, job, seen).getOffer("abc")).toMatchObject({ title: "Alternant", company: "Orbital" });
    expect(seen).toEqual({ url: "https://api.example/api/job/v1/offer/abc", auth: "Bearer k" });
  });
  it("returns null for 404/410 and throws for other errors", async () => {
    expect(await client(404, {}).getOffer("x")).toBeNull();
    expect(await client(410, {}).getOffer("x")).toBeNull();
    await expect(client(503, {}).getOffer("x")).rejects.toThrow("503");
  });
});
