import Link from "next/link";
import type { Metadata } from "next";
import { CheckSquare } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { listFollowUps, type FollowUpRow } from "@/server/services/follow-ups";
import { applicationOptions } from "@/server/services/applications";
import { deleteFollowUpAction, toggleFollowUpAction } from "@/server/actions/workflow";
import { getDictionary, type Dictionary } from "@/lib/i18n";
import { dateKeyInZone, formatCalendarDate } from "@/lib/time";
import { Badge, Button, EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/forms";
import { FollowUpForm } from "@/components/app/workflow-forms";

export const metadata: Metadata = { title: "Follow-ups" };

function Row({ fu, dict, locale, badge }: { fu: FollowUpRow; dict: Dictionary; locale: string; badge?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
      <div className="min-w-0">
        <div className={fu.completedAt ? "text-sm text-muted line-through" : "text-sm"}>{fu.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{formatCalendarDate(fu.dueAt, locale)}</span>
          {fu.applicationId ? (
            <Link href={`/app/applications/${fu.applicationId}`} className="hover:underline">{fu.companyName} · {fu.applicationTitle}</Link>
          ) : (
            <span>{dict.followUps.general}</span>
          )}
          {badge}
        </div>
      </div>
      <div className="flex gap-1">
        <form action={toggleFollowUpAction}>
          <input type="hidden" name="id" value={fu.id} />
          <input type="hidden" name="done" value={fu.completedAt ? "0" : "1"} />
          <Button type="submit" size="sm" variant="ghost">{fu.completedAt ? dict.followUps.reopen : dict.followUps.markDone}</Button>
        </form>
        <form action={deleteFollowUpAction}>
          <input type="hidden" name="id" value={fu.id} />
          <ConfirmButton label={dict.common.delete} confirmLabel={dict.common.delete} cancelLabel={dict.common.cancel} />
        </form>
      </div>
    </li>
  );
}

export default async function FollowUpsPage() {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const fu = dict.followUps;
  const [{ open, done }, apps] = await Promise.all([listFollowUps(user.id), applicationOptions(user.id)]);

  // A follow-up is due on a calendar day; "today" is the user's local day.
  const today = dateKeyInZone(new Date(), user.timezone);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const overdue = open.filter((f) => key(f.dueAt) < today);
  const dueToday = open.filter((f) => key(f.dueAt) === today);
  const later = open.filter((f) => key(f.dueAt) > today);

  const section = (title: string, rows: FollowUpRow[], badge?: React.ReactNode) =>
    rows.length ? (
      <Panel>
        <PanelHeader title={`${title} · ${rows.length}`} />
        <ul className="divide-y divide-border">{rows.map((r) => <Row key={r.id} fu={r} dict={dict} locale={user.locale} badge={badge} />)}</ul>
      </Panel>
    ) : null;

  return (
    <>
      <PageHeader title={fu.title} />
      <Panel className="mb-4 p-4"><FollowUpForm dict={dict} applications={apps} /></Panel>
      {open.length === 0 && done.length === 0 ? (
        <Panel><EmptyState icon={<CheckSquare />} title={fu.emptyTitle} body={fu.emptyBody} /></Panel>
      ) : (
        <div className="space-y-4">
          {section(fu.overdue, overdue, <Badge tone="danger">{fu.overdue}</Badge>)}
          {section(fu.dueToday, dueToday, <Badge tone="warning">{fu.dueToday}</Badge>)}
          {section(fu.upcoming, later)}
          {section(fu.done, done)}
        </div>
      )}
    </>
  );
}
