/**
 * Converts a wall-clock time in an IANA zone to a UTC instant, without a
 * timezone library. Correct across DST changes: it measures the zone's actual
 * offset at the target instant and corrects once (twice if the first guess
 * crossed a DST boundary).
 *
 * For nonexistent local times (spring-forward gap), the result is shifted
 * forward by the gap, which matches what calendar apps do.
 */
export function zonedTimeToUtc(localDateTime: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTime);
  if (!m) throw new Error("Expected YYYY-MM-DDTHH:mm");
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);

  let guess = asUtc - offsetMs(new Date(asUtc), timeZone);
  const second = asUtc - offsetMs(new Date(guess), timeZone);
  if (second !== guess) guess = second;
  return new Date(guess);
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds (Paris in winter = +3_600_000). */
export function offsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/** `YYYY-MM-DD` of `date` as seen in `timeZone`. */
export function dateKeyInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function formatDate(date: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium" }).format(date);
}

export function formatDateTime(date: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Dates stored as UTC midnight (deadlines, applied dates) must be shown in UTC, or they shift a day. */
export function formatCalendarDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "medium" }).format(date);
}

export function formatMoney(min: number | null, max: number | null, currency: string | null, locale: string): string | null {
  if (min === null && max === null) return null;
  const fmt = new Intl.NumberFormat(locale, {
    style: currency ? "currency" : "decimal",
    currency: currency ?? undefined,
    maximumFractionDigits: 0,
  });
  if (min !== null && max !== null) return `${fmt.format(min)} – ${fmt.format(max)}`;
  return fmt.format((min ?? max) as number);
}
