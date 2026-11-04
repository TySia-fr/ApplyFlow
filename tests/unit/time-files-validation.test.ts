import { describe, expect, it } from "vitest";
import { dateKeyInZone, zonedTimeToUtc } from "@/lib/time";
import { safeFilename, sniffType } from "@/lib/files";
import { applicationInput, interviewInput, listQuery } from "@/lib/validation";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";

describe("zonedTimeToUtc", () => {
  it("handles Paris winter (UTC+1) and summer (UTC+2)", () => {
    expect(zonedTimeToUtc("2026-01-15T10:00", "Europe/Paris").toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-15T10:00", "Europe/Paris").toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });

  it("is correct on the DST change day itself", () => {
    // 2026-03-29: Paris jumps 02:00 → 03:00. 10:00 that day is already UTC+2.
    expect(zonedTimeToUtc("2026-03-29T10:00", "Europe/Paris").toISOString()).toBe("2026-03-29T08:00:00.000Z");
    // 2026-11-01: New York falls back. 09:00 that day is UTC-5.
    expect(zonedTimeToUtc("2026-11-01T09:00", "America/New_York").toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });

  it("works for zones east of UTC with half-hour offsets", () => {
    expect(zonedTimeToUtc("2026-06-01T12:00", "Asia/Kolkata").toISOString()).toBe("2026-06-01T06:30:00.000Z");
  });

  it("computes the local calendar day", () => {
    expect(dateKeyInZone(new Date("2026-11-04T23:30:00Z"), "Europe/Paris")).toBe("2026-11-05");
    expect(dateKeyInZone(new Date("2026-11-04T23:30:00Z"), "UTC")).toBe("2026-11-04");
  });
});

describe("sniffType", () => {
  const bytes = (s: string) => new TextEncoder().encode(s);
  it("detects by content, not by name", () => {
    expect(sniffType(bytes("%PDF-1.7\n..."))?.mime).toBe("application/pdf");
    expect(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe("image/png");
  });
  it("rejects HTML/script disguised as a document", () => {
    expect(sniffType(bytes("<script>alert(1)</script>"))).toBeNull();
    expect(sniffType(bytes("<!DOCTYPE html><html>"))).toBeNull();
  });
  it("accepts DOCX but rejects a plain ZIP", () => {
    const zip = [0x50, 0x4b, 0x03, 0x04];
    expect(sniffType(new Uint8Array([...zip, ...bytes("....word/document.xml")]))?.ext).toBe("docx");
    expect(sniffType(new Uint8Array([...zip, ...bytes("....xl/workbook.xml")]))).toBeNull();
  });
});

describe("safeFilename", () => {
  it("strips path separators, quotes and control characters", () => {
    expect(safeFilename('../../etc/"passwd"\r\n', "pdf")).toBe("....etcpasswd.pdf");
    expect(safeFilename("CV – Siavash (2026)", "pdf")).toBe("CV-Siavash-2026.pdf");
    expect(safeFilename("日本語", "pdf")).toBe("document.pdf");
  });
});

describe("applicationInput", () => {
  const base = { title: "Dev", companyName: "Acme" };
  it("applies defaults and treats empty strings as absent", () => {
    const r = applicationInput.parse({ ...base, jobUrl: "", salaryMin: "" });
    expect(r).toMatchObject({ status: "interested", priority: "medium" });
    expect(r.jobUrl).toBeUndefined();
    expect(r.salaryMin).toBeUndefined();
  });
  it("rejects javascript: and other non-http URLs (stored XSS via href)", () => {
    expect(applicationInput.safeParse({ ...base, jobUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(applicationInput.safeParse({ ...base, jobUrl: "data:text/html,x" }).success).toBe(false);
    expect(applicationInput.safeParse({ ...base, jobUrl: "https://jobs.example.com/1" }).success).toBe(true);
  });
  it("rejects inverted salary ranges and bad currency codes", () => {
    expect(applicationInput.safeParse({ ...base, salaryMin: "50000", salaryMax: "40000" }).success).toBe(false);
    expect(applicationInput.safeParse({ ...base, currency: "euro" }).success).toBe(false);
    expect(applicationInput.parse({ ...base, currency: "eur" }).currency).toBe("EUR");
  });
  it("ignores fields it doesn't know (no mass assignment of userId/status history)", () => {
    const r = applicationInput.parse({ ...base, userId: "attacker", id: "x" }) as Record<string, unknown>;
    expect(r.userId).toBeUndefined();
    expect(r.id).toBeUndefined();
  });
});

describe("other schemas", () => {
  it("rejects unknown timezones", () => {
    const v = { applicationId: "6a1c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4", type: "video", localDateTime: "2026-01-01T10:00" };
    expect(interviewInput.safeParse({ ...v, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(interviewInput.safeParse({ ...v, timezone: "Europe/Paris" }).success).toBe(true);
  });
  it("defaults list queries and clamps paging", () => {
    expect(listQuery.parse({})).toMatchObject({ sort: "updated", page: 1, archived: false });
    expect(listQuery.safeParse({ page: "0" }).success).toBe(false);
  });
});

describe("i18n", () => {
  const flatten = (o: object, p = ""): Record<string, string> =>
    Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
      if (typeof v === "string") acc[p + k] = v;
      else Object.assign(acc, flatten(v as object, `${p}${k}.`));
      return acc;
    }, {});
  it("French has every English key, no empty strings, and the same placeholders", () => {
    const e = flatten(en);
    const f = flatten(fr);
    expect(Object.keys(f).sort()).toEqual(Object.keys(e).sort());
    for (const [k, v] of Object.entries(e)) {
      expect(f[k], k).not.toBe("");
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(ph(f[k] as string), k).toEqual(ph(v));
    }
  });
});
