import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { getApplication } from "@/server/services/applications";
import { NotFoundError } from "@/server/errors";
import {
  archiveApplicationAction,
  deleteApplicationAction,
  duplicateApplicationAction,
} from "@/server/actions/applications";
import { deleteFollowUpAction, deleteInterviewAction, toggleFollowUpAction } from "@/server/actions/workflow";
import { getDictionary, t } from "@/lib/i18n";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/time";
import { Badge, Button, ButtonLink, Panel, PanelHeader } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/forms";
import { PriorityMark, StatusBadge } from "@/components/status";
import { FollowUpForm, InterviewForm, OutcomeForm, StatusChangeForm } from "@/components/app/workflow-forms";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationPage({ params }: PageProps<"/app/applications/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const dict = getDictionary(user.locale);
  const data = await getApplication(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const a = data.app;
  const f = dict.fields;
  const L = dict.applications;
  const salary = formatMoney(a.salaryMin, a.salaryMax, a.currency, user.locale);
  const today = new Date();

  const details: [string, React.ReactNode][] = [
    [f.priority, <PriorityMark key="p" priority={a.priority} dict={dict} />],
    [f.location, [a.location, a.country].filter(Boolean).join(", ") || null],
    [f.workMode, a.workMode ? dict.workMode[a.workMode] : null],
    [f.employmentType, a.employmentType ? dict.employmentType[a.employmentType] : null],
    [f.salary, salary],
    [f.source, a.source],
    [f.appliedAt, a.appliedAt ? formatCalendarDate(a.appliedAt, user.locale) : null],
    [f.deadline, a.deadline ? formatCalendarDate(a.deadline, user.locale) : null],
    [f.resume, data.resumeTitle ? <Link key="r" className="underline underline-offset-2" href="/app/documents">{data.resumeTitle}</Link> : null],
    [f.companyWebsite, data.companyWebsite ? <a key="w" className="underline underline-offset-2" href={data.companyWebsite} rel="noopener noreferrer" target="_blank">{new URL(data.companyWebsite).host}</a> : null],
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/applications" className="text-xs text-muted hover:text-fg">← {L.title}</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{a.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{data.companyName}</span>
            <StatusBadge status={a.status} dict={dict} />
            {a.archivedAt ? <Badge>{L.archived}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {a.jobUrl ? (
            <ButtonLink href={a.jobUrl} target="_blank" rel="noopener noreferrer" size="sm" variant="ghost">
              <ExternalLink aria-hidden /> {L.openPosting}
            </ButtonLink>
          ) : null}
          <ButtonLink href={`/app/applications/${a.id}/edit`} size="sm"><Pencil aria-hidden /> {dict.common.edit}</ButtonLink>
          <form action={duplicateApplicationAction}>
            <input type="hidden" name="id" value={a.id} />
            <SubmitButton size="sm">{dict.common.duplicate}</SubmitButton>
          </form>
          <form action={archiveApplicationAction}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="archived" value={a.archivedAt ? "0" : "1"} />
            <SubmitButton size="sm">{a.archivedAt ? dict.common.unarchive : dict.common.archive}</SubmitButton>
          </form>
          <form action={deleteApplicationAction}>
            <input type="hidden" name="id" value={a.id} />
            <ConfirmButton label={dict.common.delete} confirmLabel={dict.common.delete} cancelLabel={dict.common.cancel} description={L.deleteConfirm} />
          </form>
        </div>
      </div>

      <Panel className="mb-4 p-4">
        <StatusChangeForm dict={dict} applicationId={a.id} current={a.status} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel>
            <PanelHeader title={L.details} />
            <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2">
              {details.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-0.5">{v ?? <span className="text-muted">—</span>}</dd>
                </div>
              ))}
            </dl>
            {a.description ? (
              <div className="border-t border-border p-4">
                <h3 className="mb-1.5 text-xs text-muted">{f.description}</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{a.description}</p>
              </div>
            ) : null}
            {a.notes ? (
              <div className="border-t border-border p-4">
                <h3 className="mb-1.5 text-xs text-muted">{f.notes}</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{a.notes}</p>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <PanelHeader title={dict.interviews.title} action={<InterviewForm dict={dict} applicationId={a.id} defaultTimezone={user.timezone} />} />
            {data.interviews.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">{dict.interviews.emptyTitle}</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.interviews.map((iv) => (
                  <li key={iv.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{dict.interviews.types[iv.type]}</div>
                        <div className="text-xs text-muted">
                          {t(dict.interviews.inZone, { time: formatDateTime(iv.scheduledAt, user.locale, iv.timezone), zone: iv.timezone })}
                          {iv.timezone !== user.timezone ? ` · ${t(dict.interviews.yourTime, { time: formatDateTime(iv.scheduledAt, user.locale, user.timezone) })}` : null}
                          {` · ${iv.durationMinutes} min`}
                        </div>
                        {iv.locationOrUrl ? <div className="mt-1 text-xs text-muted">{iv.locationOrUrl}</div> : null}
                      </div>
                      <form action={deleteInterviewAction}>
                        <input type="hidden" name="id" value={iv.id} />
                        <ConfirmButton label={dict.common.delete} confirmLabel={dict.common.delete} cancelLabel={dict.common.cancel} />
                      </form>
                    </div>
                    {iv.preparationNotes ? <p className="mt-2 text-sm whitespace-pre-wrap"><span className="text-xs text-muted">{dict.interviews.preparation}: </span>{iv.preparationNotes}</p> : null}
                    {iv.questionsToAsk ? <p className="mt-1 text-sm whitespace-pre-wrap"><span className="text-xs text-muted">{dict.interviews.questions}: </span>{iv.questionsToAsk}</p> : null}
                    <OutcomeForm dict={dict} interviewId={iv.id} outcome={iv.outcome} feedback={iv.feedback} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title={dict.followUps.title} />
            <div className="border-b border-border p-4">
              <FollowUpForm dict={dict} applicationId={a.id} />
            </div>
            {data.followUps.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">{dict.followUps.emptyTitle}</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.followUps.map((fu) => {
                  const overdue = !fu.completedAt && fu.dueAt < new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
                  return (
                    <li key={fu.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <div className={fu.completedAt ? "text-sm text-muted line-through" : "text-sm"}>
                        {fu.title}
                        <span className="ml-2 text-xs text-muted no-underline">{formatCalendarDate(fu.dueAt, user.locale)}</span>
                        {overdue ? <Badge tone="danger" className="ml-2">{dict.followUps.overdue}</Badge> : null}
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
                })}
              </ul>
            )}
          </Panel>
        </div>

        <Panel className="h-fit">
          <PanelHeader title={L.timeline} />
          <ol className="relative space-y-4 p-4">
            {data.events.map((e) => (
              <li key={e.id} className="relative pl-5">
                <span aria-hidden className="absolute top-1.5 left-0 size-2 rounded-full bg-accent" />
                <div className="text-sm">
                  {e.fromStatus
                    ? t(L.changed, { from: dict.status[e.fromStatus], to: dict.status[e.toStatus] })
                    : t(L.created, { to: dict.status[e.toStatus] })}
                </div>
                <time className="text-xs text-muted" dateTime={e.occurredAt.toISOString()}>
                  {formatDateTime(e.occurredAt, user.locale, user.timezone)}
                </time>
                {e.note ? <p className="mt-1 text-xs text-muted whitespace-pre-wrap">{e.note}</p> : null}
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}
