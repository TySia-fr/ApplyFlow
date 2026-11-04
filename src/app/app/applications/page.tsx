import Link from "next/link";
import type { Metadata } from "next";
import { Briefcase, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { listApplications } from "@/server/services/applications";
import { getDictionary, t } from "@/lib/i18n";
import { listQuery } from "@/lib/validation";
import { PRIORITIES, STATUSES } from "@/lib/applications/status";
import { formatCalendarDate, formatDate } from "@/lib/time";
import { Button, ButtonLink, EmptyState, Input, PageHeader, Panel, Select } from "@/components/ui";
import { PriorityMark, StatusBadge } from "@/components/status";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: PageProps<"/app/applications">) {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const a = dict.applications;
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = listQuery.safeParse(flat);
  // Invalid params fall back to defaults instead of erroring: URLs get hand-edited.
  const query = parsed.success ? parsed.data : listQuery.parse({});
  const { rows, total, pages } = await listApplications(user.id, query);
  const hasFilters = Boolean(query.q || query.status || query.priority || query.archived);

  const pageHref = (page: number) => {
    const p = new URLSearchParams(Object.entries(flat).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
    p.set("page", String(page));
    return `/app/applications?${p}`;
  };

  return (
    <>
      <PageHeader
        title={a.title}
        description={t(a.count, { count: total })}
        actions={
          <>
            <ButtonLink href="/app/applications/board">{a.board}</ButtonLink>
            <ButtonLink href="/app/applications/new" variant="primary">
              <Plus aria-hidden /> {a.new}
            </ButtonLink>
          </>
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <label className="sr-only" htmlFor="q">{dict.common.search}</label>
        <Input id="q" name="q" defaultValue={query.q ?? ""} placeholder={a.searchPlaceholder} className="w-64 max-w-full" />
        <label className="sr-only" htmlFor="status">{dict.fields.status}</label>
        <Select id="status" name="status" defaultValue={query.status ?? ""} className="w-44">
          <option value="">{dict.fields.status}: {dict.common.all}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{dict.status[s]}</option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="priority">{dict.fields.priority}</label>
        <Select id="priority" name="priority" defaultValue={query.priority ?? ""} className="w-40">
          <option value="">{dict.fields.priority}: {dict.common.all}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{dict.priority[p]}</option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="sort">{a.sort}</label>
        <Select id="sort" name="sort" defaultValue={query.sort} className="w-48">
          <option value="updated">{a.sortUpdated}</option>
          <option value="created">{a.sortCreated}</option>
          <option value="deadline">{a.sortDeadline}</option>
          <option value="priority">{a.sortPriority}</option>
        </Select>
        <label className="flex h-8 items-center gap-1.5 px-1 text-sm text-muted">
          <input type="checkbox" name="archived" value="1" defaultChecked={query.archived} className="accent-accent" />
          {a.showArchived}
        </label>
        <Button type="submit">{dict.common.apply}</Button>
        {hasFilters ? <ButtonLink href="/app/applications" variant="ghost">{dict.common.reset}</ButtonLink> : null}
      </form>

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          hasFilters ? (
            <p className="px-4 py-10 text-center text-sm text-muted">{a.noResults}</p>
          ) : (
            <EmptyState
              icon={<Briefcase />}
              title={a.emptyTitle}
              body={a.emptyBody}
              action={<ButtonLink href="/app/applications/new" variant="primary"><Plus aria-hidden /> {a.new}</ButtonLink>}
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2/50 text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">{dict.fields.title}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{dict.fields.status}</th>
                  <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">{dict.fields.priority}</th>
                  <th scope="col" className="hidden px-4 py-2 font-medium lg:table-cell">{dict.fields.location}</th>
                  <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">{dict.fields.deadline}</th>
                  <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">{dict.fields.updated}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/50">
                    <td className="max-w-80 px-4 py-2.5">
                      <Link href={`/app/applications/${r.id}`} className="block truncate font-medium hover:underline">
                        {r.title}
                      </Link>
                      <span className="block truncate text-xs text-muted">{r.companyName}</span>
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.status} dict={dict} /></td>
                    <td className="hidden px-4 py-2.5 md:table-cell"><PriorityMark priority={r.priority} dict={dict} /></td>
                    <td className="hidden px-4 py-2.5 text-muted lg:table-cell">
                      {[r.location, r.workMode ? dict.workMode[r.workMode] : null].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="hidden px-4 py-2.5 whitespace-nowrap text-muted tabular-nums sm:table-cell">
                      {r.deadline ? formatCalendarDate(r.deadline, user.locale) : "—"}
                    </td>
                    <td className="hidden px-4 py-2.5 whitespace-nowrap text-muted tabular-nums sm:table-cell">
                      {formatDate(r.updatedAt, user.locale, user.timezone)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-muted">{t(dict.common.page, { page: query.page, pages })}</span>
          <div className="flex gap-2">
            {query.page > 1 ? <ButtonLink href={pageHref(query.page - 1)} size="sm">{dict.common.previous}</ButtonLink> : null}
            {query.page < pages ? <ButtonLink href={pageHref(query.page + 1)} size="sm">{dict.common.next}</ButtonLink> : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
