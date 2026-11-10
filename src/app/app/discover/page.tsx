import Link from "next/link";
import type { Metadata } from "next";
import { ExternalLink, Radar, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { discoveryEnabled } from "@/server/env";
import { listOffers, listSavedSearches, offerCounts } from "@/server/services/discovery";
import { deleteSavedSearchAction, offerAction } from "@/server/actions/discovery";
import { getDictionary, t } from "@/lib/i18n";
import { familiesFor } from "@/lib/discovery";
import { formatDate, formatDateTime } from "@/lib/time";
import { Alert, Badge, Button, EmptyState, PageHeader, Panel, PanelHeader, buttonVariants, cn } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { RunSearchButton, SavedSearchForm } from "@/components/app/discover-forms";

export const metadata: Metadata = { title: "Discover" };

const TABS = ["new", "added", "dismissed"] as const;

export default async function DiscoverPage({ searchParams }: PageProps<"/app/discover">) {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const d = dict.discover;
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "new";
  const [searches, offers, counts] = await Promise.all([listSavedSearches(user.id), listOffers(user.id, tab), offerCounts(user.id)]);
  const hasSample = offers.some((o) => o.source === "sample");

  return (
    <>
      <PageHeader title={d.title} description={d.description} />
      {!discoveryEnabled ? <div className="mb-4"><Alert tone="info">{d.notConfigured}</Alert></div> : null}

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Panel>
            <div className="flex gap-1 border-b border-border px-2 pt-2" role="tablist">
              {TABS.map((k) => (
                <Link
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  href={`/app/discover${k === "new" ? "" : `?tab=${k}`}`}
                  className={cn(
                    "-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm",
                    tab === k ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg",
                  )}
                >
                  {{ new: d.tabNew, added: d.tabAdded, dismissed: d.tabDismissed }[k]}{" "}
                  <span className="tabular-nums text-muted">{counts[k]}</span>
                </Link>
              ))}
            </div>
            {offers.length === 0 ? (
              tab === "new" ? (
                <EmptyState icon={<Radar />} title={d.tabNew} body={d.emptyNew} />
              ) : (
                <p className="px-4 py-10 text-center text-sm text-muted">{d.emptyOther}</p>
              )
            ) : (
              <ul className="divide-y divide-border">
                {offers.map((o) => (
                  <li key={o.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{o.title}</span>
                          {o.source === "sample" ? <Badge tone="warning">{d.sample}</Badge> : null}
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          {[o.company, o.location, o.contractTypes, o.workMode ? dict.workMode[o.workMode] : null].filter(Boolean).join(" · ")}
                        </div>
                        {o.publishedAt ? <div className="mt-0.5 text-xs text-muted">{t(d.published, { date: formatDate(o.publishedAt, user.locale, user.timezone) })}</div> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {o.url ? (
                          <a href={o.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
                            <ExternalLink aria-hidden /> {d.view}
                          </a>
                        ) : null}
                        {tab === "added" && o.applicationId ? (
                          <Link href={`/app/applications/${o.applicationId}`} className={buttonVariants({ size: "sm" })}>{d.openApplication}</Link>
                        ) : null}
                        {tab !== "added" ? (
                          <form action={offerAction} className="flex gap-1">
                            <input type="hidden" name="id" value={o.id} />
                            {tab === "new" ? (
                              <>
                                <Button type="submit" name="op" value="dismiss" size="sm" variant="ghost">{d.dismiss}</Button>
                                <Button type="submit" name="op" value="add" size="sm" variant="primary">{d.add}</Button>
                              </>
                            ) : (
                              <Button type="submit" name="op" value="restore" size="sm">{d.restore}</Button>
                            )}
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {hasSample ? <p className="text-xs text-muted">{d.sampleNote}</p> : null}
          <p className="text-xs text-muted">{d.attribution}</p>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Panel>
            <PanelHeader title={d.searches} />
            {searches.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">{d.noSearches}</p>
            ) : (
              <ul className="divide-y divide-border">
                {searches.map((s) => (
                  <li key={s.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{s.name}</div>
                        <div className="text-xs text-muted">
                          {familiesFor(s.romeCodes).map((f) => dict.families[f]).join(", ")} · {s.departements.join(", ")} ·{" "}
                          {d.levels[String(s.diplomaLevel) as keyof typeof d.levels]}
                        </div>
                        <div className="text-xs text-muted">
                          {s.lastRunAt ? t(d.lastRun, { when: formatDateTime(s.lastRunAt, user.locale, user.timezone) }) : d.neverRun}
                          {s.notifyTelegram ? " · Telegram" : ""}
                        </div>
                        {s.lastError ? <div className="text-xs text-danger">{t(d.runFailed, { error: s.lastError })}</div> : null}
                      </div>
                      <form action={deleteSavedSearchAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <SubmitButton size="sm" variant="ghost" aria-label={`${dict.common.delete}: ${s.name}`}>
                          <Trash2 aria-hidden />
                        </SubmitButton>
                      </form>
                    </div>
                    {discoveryEnabled ? <RunSearchButton dict={dict} id={s.id} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel>
            <PanelHeader title={d.newSearch} />
            <div className="p-4"><SavedSearchForm dict={dict} /></div>
          </Panel>
        </div>
      </div>
    </>
  );
}
