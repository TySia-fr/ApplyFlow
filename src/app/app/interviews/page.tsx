import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { interviewsInRange, listInterviews, type InterviewRow } from "@/server/services/interviews";
import { getDictionary } from "@/lib/i18n";
import { dateKeyInZone, formatDateTime, zonedTimeToUtc } from "@/lib/time";
import { Badge, ButtonLink, EmptyState, PageHeader, Panel, PanelHeader, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Interviews" };

const pad = (n: number) => String(n).padStart(2, "0");

export default async function InterviewsPage({ searchParams }: PageProps<"/app/interviews">) {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const i = dict.interviews;
  const tz = user.timezone;
  const now = new Date();

  // Month shown in the user's timezone; ?month=YYYY-MM navigates.
  const todayKey = dateKeyInZone(now, tz);
  const sp = await searchParams;
  const monthParam = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : todayKey.slice(0, 7);
  const [y, m] = monthParam.split("-").map(Number) as [number, number];
  const from = zonedTimeToUtc(`${y}-${pad(m)}-01T00:00`, tz);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const to = zonedTimeToUtc(`${ny}-${pad(nm)}-01T00:00`, tz);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const next = `${ny}-${pad(nm)}`;

  const [{ upcoming, past }, monthItems] = await Promise.all([listInterviews(user.id, now), interviewsInRange(user.id, from, to)]);

  const byDay = new Map<string, InterviewRow[]>();
  for (const it of monthItems) {
    const k = dateKeyInZone(it.scheduledAt, tz);
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, k) => k + 1)];
  while (cells.length % 7) cells.push(null);
  const weekdayNames = Array.from({ length: 7 }, (_, k) =>
    new Intl.DateTimeFormat(user.locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + k))),
  );
  const monthLabel = new Intl.DateTimeFormat(user.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  const timeFmt = new Intl.DateTimeFormat(user.locale, { timeZone: tz, timeStyle: "short" });

  const renderList = (items: InterviewRow[]) => (
    <ul className="divide-y divide-border">
      {items.map((it) => (
        <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <div className="min-w-0">
            <Link href={`/app/applications/${it.applicationId}`} className="block truncate text-sm font-medium hover:underline">
              {it.companyName} · {it.title}
            </Link>
            <div className="text-xs text-muted">{i.types[it.type]} · {formatDateTime(it.scheduledAt, user.locale, tz)}</div>
          </div>
          <Badge tone={it.outcome === "passed" ? "success" : it.outcome === "failed" ? "danger" : "neutral"}>{i.outcomes[it.outcome]}</Badge>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader title={i.title} />
      <Panel className="mb-4">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-medium capitalize">{monthLabel}</h2>
          <div className="flex gap-1">
            <ButtonLink href={`/app/interviews?month=${prev}`} size="sm" variant="ghost" aria-label={i.prevMonth}><ChevronLeft aria-hidden /></ButtonLink>
            <ButtonLink href="/app/interviews" size="sm" variant="ghost">{i.today}</ButtonLink>
            <ButtonLink href={`/app/interviews?month=${next}`} size="sm" variant="ghost" aria-label={i.nextMonth}><ChevronRight aria-hidden /></ButtonLink>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[42rem] grid-cols-7 text-xs">
            {weekdayNames.map((w) => (
              <div key={w} className="border-b border-border px-2 py-1.5 text-muted">{w}</div>
            ))}
            {cells.map((d, idx) => {
              const key = d ? `${y}-${pad(m)}-${pad(d)}` : `x${idx}`;
              const items = d ? (byDay.get(key) ?? []) : [];
              return (
                <div key={key} className={cn("min-h-20 border-b border-border p-1.5 [&:not(:nth-child(7n))]:border-r", !d && "bg-surface-2/40")}>
                  {d ? (
                    <>
                      <div className={cn("mb-1 inline-flex size-5 items-center justify-center rounded-sm tabular-nums", key === todayKey ? "bg-accent text-accent-fg" : "text-muted")}>{d}</div>
                      <ul className="space-y-1">
                        {items.map((it) => (
                          <li key={it.id}>
                            <Link href={`/app/applications/${it.applicationId}`} className="block truncate rounded-sm bg-violet-soft px-1 py-0.5 text-violet hover:underline" title={`${it.companyName} · ${it.title}`}>
                              {timeFmt.format(it.scheduledAt)} {it.companyName}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {upcoming.length === 0 && past.length === 0 ? (
        <Panel><EmptyState icon={<CalendarDays />} title={i.emptyTitle} body={i.emptyBody} action={<ButtonLink href="/app/applications">{dict.nav.applications}</ButtonLink>} /></Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel><PanelHeader title={i.upcoming} />{upcoming.length ? renderList(upcoming) : <p className="px-4 py-6 text-sm text-muted">{dict.dashboard.nothingUpcoming}</p>}</Panel>
          <Panel><PanelHeader title={i.past} />{past.length ? renderList(past) : <p className="px-4 py-6 text-sm text-muted">—</p>}</Panel>
        </div>
      )}
    </>
  );
}
