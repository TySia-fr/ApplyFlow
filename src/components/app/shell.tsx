import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { requireUser } from "@/server/auth/current-user";
import { signOutAction } from "@/server/actions/auth";
import { getDictionary, t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/time";
import { Logo } from "@/components/public/landing";
import { ButtonLink, Skeleton } from "@/components/ui";
import { NavLinks } from "@/components/app/nav-links";
import { LogOut, Menu } from "lucide-react";

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const nav = {
    dashboard: dict.nav.dashboard,
    applications: dict.nav.applications,
    board: dict.nav.board,
    interviews: dict.nav.interviews,
    followUps: dict.nav.followUps,
    documents: dict.nav.documents,
    settings: dict.nav.settings,
  };
  const signOut = (
    <form action={signOutAction}>
      <button
        type="submit"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
      >
        <LogOut aria-hidden className="size-4" /> {dict.nav.signOut}
      </button>
    </form>
  );

  return (
    <div lang={user.locale} className="flex min-h-full flex-1 flex-col md:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-surface focus:p-2">
        {dict.common.skipToContent}
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <Link href="/app" className="flex h-14 items-center gap-2 px-4 text-sm font-semibold">
          <Logo /> ApplyFlow
        </Link>
        <nav className="flex-1 px-2" aria-label="Main">
          <NavLinks labels={nav} />
        </nav>
        <div className="border-t border-border p-2">
          <div className="truncate px-2 pb-1 text-xs text-muted" title={user.email}>
            {user.name}
          </div>
          {signOut}
        </div>
      </aside>
      {/* Mobile top bar: <details> works without JavaScript */}
      <details className="group border-b border-border bg-surface md:hidden">
        <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Logo /> ApplyFlow
          </span>
          <span className="flex items-center gap-1 text-sm text-muted">
            <Menu aria-hidden className="size-4" /> {dict.nav.menu}
          </span>
        </summary>
        <nav className="px-2 pb-2" aria-label="Main">
          <NavLinks labels={nav} />
          {signOut}
        </nav>
      </details>
      <div className="flex min-w-0 flex-1 flex-col">
        {user.isDemo && user.demoExpiresAt ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent-soft px-4 py-2 text-sm text-fg md:px-8">
            <span>
              {t(dict.auth.demoBanner, { when: formatDateTime(user.demoExpiresAt, user.locale, user.timezone) })}
            </span>
            <ButtonLink href={`/${user.locale}/sign-up`} size="sm" variant="secondary">
              {dict.auth.demoCreateAccount}
            </ButtonLink>
          </div>
        ) : null}
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8 has-[[data-wide]]:max-w-none">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="flex min-h-full flex-1">
      <div className="hidden w-56 border-r border-border bg-surface md:block" />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
        <PageSkeleton />
      </div>
    </div>
  );
}
