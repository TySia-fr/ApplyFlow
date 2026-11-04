import {
  INTERVIEW_STATUSES,
  OFFER_STATUSES,
  RESPONSE_STATUSES,
  SUBMITTED_STATUSES,
  type Status,
} from "@/lib/applications/status";

/**
 * Funnel metrics computed from the status history, not the current status.
 * An application rejected after two interviews still counts as "interviewed":
 * the current snapshot would lose that, the event log does not.
 */
export type ApplicationHistory = {
  currentStatus: Status;
  /** Every status the application has ever been in (from application_event). */
  reached: readonly Status[];
};

export type Rate = {
  numerator: number;
  denominator: number;
  /** null when the denominator is 0: "no data" is not "0%". */
  value: number | null;
  /** True below MIN_SAMPLE; the UI must say so instead of presenting a trend. */
  smallSample: boolean;
};

export const MIN_SAMPLE = 5;

export type Funnel = {
  total: number;
  active: number;
  submitted: number;
  responded: number;
  interviewed: number;
  offers: number;
  rejected: number;
  responseRate: Rate;
  interviewRate: Rate;
  offerRate: Rate;
};

function rate(numerator: number, denominator: number): Rate {
  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
    smallSample: denominator < MIN_SAMPLE,
  };
}

function reachedAny(h: ApplicationHistory, set: ReadonlySet<Status>): boolean {
  return set.has(h.currentStatus) || h.reached.some((s) => set.has(s));
}

export function computeFunnel(histories: readonly ApplicationHistory[]): Funnel {
  let active = 0;
  let submitted = 0;
  let responded = 0;
  let interviewed = 0;
  let offers = 0;
  let rejected = 0;

  for (const h of histories) {
    if (!["accepted", "rejected", "withdrawn"].includes(h.currentStatus)) active++;
    if (h.currentStatus === "rejected") rejected++;
    // Rates are conditional on submission: unsent drafts must not dilute them.
    if (!reachedAny(h, SUBMITTED_STATUSES)) continue;
    submitted++;
    if (reachedAny(h, RESPONSE_STATUSES)) responded++;
    if (reachedAny(h, INTERVIEW_STATUSES)) interviewed++;
    if (reachedAny(h, OFFER_STATUSES)) offers++;
  }

  return {
    total: histories.length,
    active,
    submitted,
    responded,
    interviewed,
    offers,
    rejected,
    responseRate: rate(responded, submitted),
    interviewRate: rate(interviewed, submitted),
    offerRate: rate(offers, submitted),
  };
}

/**
 * Buckets dates into consecutive ISO weeks (Monday start, UTC) ending at `now`,
 * including empty weeks so a chart shows gaps honestly.
 */
export function weeklyCounts(dates: readonly Date[], weeks: number, now: Date): { weekStart: string; count: number }[] {
  const startOfWeek = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = (x.getUTCDay() + 6) % 7; // Monday = 0
    x.setUTCDate(x.getUTCDate() - day);
    return x;
  };
  const current = startOfWeek(now);
  const buckets = new Map<string, number>();
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const w = new Date(current);
    w.setUTCDate(w.getUTCDate() - i * 7);
    const key = w.toISOString().slice(0, 10);
    keys.push(key);
    buckets.set(key, 0);
  }
  for (const d of dates) {
    const key = startOfWeek(d).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return keys.map((weekStart) => ({ weekStart, count: buckets.get(weekStart) ?? 0 }));
}
