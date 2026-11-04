import Link from "next/link";
import type { Metadata } from "next";
import { BarChart3, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { getDashboard } from "@/server/services/dashboard";
import { getDictionary, t, type Dictionary } from "@/lib/i18n";
import { MIN_SAMPLE, type Rate } from "@/lib/metrics";
import { formatCalendarDate, formatDateTime } from "@/lib/time";
import { ButtonLink, EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui";
import { StatusBadge, statusTone } from "@/components/status";

export const metadata: Metadata = { title: "Dashboard" };

const BAR: Record<string, string> = {
  neutral: "bg-border-strong",
  info: "bg-info",
  violet: "bg-violet",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  accent: "bg-accent",
};

function pct(r: Rate) {
  return r.value === null ? "—" : `${Math.round(r.value * 100)}%`;
}

function RateCard({ label, def, rate, dict }: { label: string; def: string; rate: Rate; dict: Dictionary }) {
  return (
    <Panel className="p-4">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{pct(rate)}</div>
      <div className="mt-1 text-xs text-muted">
        {rate.denominator === 0
          ? dict.dashboard.noData
          : t(dict.dashboard.ofSubmitted, { n: rate.numerator, d: rate.denominator })}
      </div>
      {rate.denominator > 0 && rate.smallSample ? (
        <div className="mt-2 text-xs text-warning">{t(dict.dashboard.smallSample, { min: MIN_SAMPLE })}</div>
      ) : null}
      <p className="mt-2 text-xs leading-relaxed text-muted">{def}</p>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const d = dict.dashboard;
  const data = await getDashboard(user.id);
  const f = data.funnel;

  if (f.total === 0) {
    return (
      <>
        <PageHeader title={d.title} />
        <Panel>
          <EmptyState
            icon={<BarChart3 />}
            title={d.emptyTitle}
            body={d.emptyBody}
            action={
              <ButtonLink href="/app/applications/new" variant="primary">
                <Plus aria-hidden /> {dict.applications.new}
              </ButtonLink>
            }
          />
        </Panel>
      </>
    );
  }

  const maxWeek = Math.max(1, ...data.weekly.map((w) => w.count));
  const maxStatus = Math.max(1, ...data.byStatus.map((s) => s.count));

  return (
    <>
      <PageHeader
        title={d.title}
        actions={
          <ButtonLink href="/app/applications/new" variant="primary">
            <Plus aria-hidden /> {dict.applications.new}
          </ButtonLink>
        }
      />

      <Panel className="mb-4 grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
        <Stat label={d.total} value={f.total} />
        <Stat label={d.active} value={f.active} />
        <Stat label={d.thisMonth} value={data.thisMonth} />
        <Stat label={d.submitted} value={f.submitted} />
        <Stat label={d.offers} value={f.offers} />
        <Stat label={d.rejected} value={f.rejected} />
      </Panel>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <RateCard label={d.responseRate} def={d.responseDef} rate={f.responseRate} dict={dict} />
        <RateCard label={d.interviewRate} def={d.interviewDef} rate={f.interviewRate} dict={dict} />
        <RateCard label={d.offerRate} def={d.offerDef} rate={f.offerRate} dict={dict} />
      </div>

      <div className="mb-4 grid items-start gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader title={d.weekly} />
          {/* Server-rendered bars + a real table for screen readers. No chart JS shipped. */}
          <div className="flex h-44 items-end gap-1.5 px-4 pt-4 pb-2" aria-hidden>
            {data.weekly.map((w) => (
              <div key={w.weekStart} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${t(d.weekOf, { date: formatCalendarDate(new Date(w.weekStart), user.locale) })}: ${w.count}`}>
                <span className="text-[10px] tabular-nums text-muted">{w.count || ""}</span>
                <div className="w-full rounded-t-sm bg-accent/80" style={{ height: `${(w.count / maxWeek) * 85}%`, minHeight: w.count ? 3 : 1, opacity: w.count ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between px-4 pb-3 text-[11px] text-muted" aria-hidden>
            <span>{data.weekly[0] ? formatCalendarDate(new Date(data.weekly[0].weekStart), user.locale) : null}</span>
            <span>{data.weekly.at(-1) ? formatCalendarDate(new Date(data.weekly.at(-1)!.weekStart), user.locale) : null}</span>
          </div>
          <table className="sr-only">
            <caption>{d.weekly}</caption>
            <tbody>
              {data.weekly.map((w) => (
                <tr key={w.weekStart}>
                  <th scope="row">{t(d.weekOf, { date: formatCalendarDate(new Date(w.weekStart), user.locale) })}</th>
                  <td>{w.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader title={d.byStatus} />
          <ul className="space-y-2.5 p-4">
            {data.byStatus.map((s) => (
              <li key={s.status} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2 text-sm">
                <Link href={`/app/applications?status=${s.status}`} className="truncate text-muted hover:text-fg">
                  {dict.status[s.status]}
                </Link>
                <div className="h-2 rounded-sm bg-surface-2">
                  <div className={`h-2 rounded-sm ${BAR[statusTone(s.status)]}`} style={{ width: `${(s.count / maxStatus) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader title={d.upcoming} action={<Link href="/app/interviews" className="text-xs text-muted hover:text-fg">{dict.common.view}</Link>} />
          {data.upcoming.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">{d.nothingUpcoming}</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.upcoming.map((i) => (
                <li key={i.id} className="px-4 py-2.5">
                  <Link href={`/app/applications/${i.applicationId}`} className="text-sm font-medium hover:underline">
                    {i.companyName} · {i.title}
                  </Link>
                  <div className="text-xs text-muted">
                    {dict.interviews.types[i.type]} · {formatDateTime(i.scheduledAt, user.locale, user.timezone)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title={d.dueFollowUps} action={<Link href="/app/follow-ups" className="text-xs text-muted hover:text-fg">{dict.common.view}</Link>} />
          {data.due.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">{d.nothingDue}</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.due.map((fu) => (
                <li key={fu.id} className="px-4 py-2.5">
                  <div className="text-sm">{fu.title}</div>
                  <div className="text-xs text-muted">{formatCalendarDate(fu.dueAt, user.locale)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title={d.recent} />
          {data.recent.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">{d.noActivity}</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recent.map((e) => (
                <li key={e.id} className="px-4 py-2.5">
                  <Link href={`/app/applications/${e.applicationId}`} className="block truncate text-sm hover:underline">
                    {e.companyName} · {e.title}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <StatusBadge status={e.toStatus} dict={dict} />
                    <span>{formatDateTime(e.occurredAt, user.locale, user.timezone)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
