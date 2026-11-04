import { describe, expect, it } from "vitest";
import { computeFunnel, weeklyCounts } from "@/lib/metrics";

describe("computeFunnel", () => {
  it("returns null rates, not 0%, when nothing was submitted", () => {
    const f = computeFunnel([{ currentStatus: "interested", reached: ["interested"] }]);
    expect(f.submitted).toBe(0);
    expect(f.responseRate.value).toBeNull();
    expect(f.total).toBe(1);
    expect(f.active).toBe(1);
  });

  it("counts history, not the current snapshot: a rejection after interviews still counts as interviewed", () => {
    const f = computeFunnel([{ currentStatus: "rejected", reached: ["applied", "screening", "interview", "rejected"] }]);
    expect(f.interviewed).toBe(1);
    expect(f.responded).toBe(1);
    expect(f.rejected).toBe(1);
    expect(f.active).toBe(0);
  });

  it("treats skipping straight to a later stage as submitted", () => {
    const f = computeFunnel([{ currentStatus: "interview", reached: ["saved", "interview"] }]);
    expect(f.submitted).toBe(1);
    expect(f.interviewed).toBe(1);
  });

  it("excludes drafts and withdrawals-before-applying from rate denominators", () => {
    const f = computeFunnel([
      { currentStatus: "applied", reached: ["applied"] },
      { currentStatus: "withdrawn", reached: ["saved", "withdrawn"] },
      { currentStatus: "preparing", reached: ["preparing"] },
    ]);
    expect(f.submitted).toBe(1);
    expect(f.responseRate).toMatchObject({ numerator: 0, denominator: 1, value: 0 });
  });

  it("flags small samples", () => {
    const four = Array.from({ length: 4 }, () => ({ currentStatus: "applied" as const, reached: ["applied" as const] }));
    expect(computeFunnel(four).responseRate.smallSample).toBe(true);
    expect(computeFunnel([...four, ...four]).responseRate.smallSample).toBe(false);
  });
});

describe("weeklyCounts", () => {
  it("includes empty weeks and buckets by ISO week (Monday start, UTC)", () => {
    const now = new Date("2026-11-04T12:00:00Z"); // Wednesday
    const weeks = weeklyCounts(
      [new Date("2026-11-02T00:00:00Z"), new Date("2026-11-01T23:59:59Z"), new Date("2026-10-20T10:00:00Z")],
      4,
      now,
    );
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(weeks.map((w) => w.count)).toEqual([0, 1, 1, 1]);
  });

  it("ignores dates outside the window", () => {
    const weeks = weeklyCounts([new Date("2020-01-01T00:00:00Z")], 2, new Date("2026-11-04T00:00:00Z"));
    expect(weeks.every((w) => w.count === 0)).toBe(true);
  });
});
