import Image from "next/image";
import Link from "next/link";
import { Activity, CalendarClock, GitBranch, Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { DemoButton } from "@/components/public/demo-button";
import type { Dictionary, Locale } from "@/lib/i18n";

const REPO = "https://github.com/TySia-fr/applyflow";

export function PublicHeader({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const other = lang === "en" ? "fr" : "en";
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href={lang === "en" ? "/" : "/fr"} className="flex items-center gap-2 text-sm font-semibold">
          <Logo /> ApplyFlow
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href={other === "en" ? "/" : "/fr"}
            hrefLang={other}
            className="rounded-md px-2 py-1 text-xs font-medium uppercase text-muted hover:text-fg"
          >
            {other}
          </Link>
          <ButtonLink href={`/${lang}/sign-in`} variant="ghost" size="sm">
            {dict.landing.signIn}
          </ButtonLink>
          <ButtonLink href={`/${lang}/sign-up`} variant="secondary" size="sm">
            {dict.landing.signUp}
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}

export function Logo() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" className="text-accent">
      <rect x="1" y="1" width="4" height="16" rx="1.2" fill="currentColor" opacity=".35" />
      <rect x="7" y="4" width="4" height="13" rx="1.2" fill="currentColor" opacity=".65" />
      <rect x="13" y="8" width="4" height="9" rx="1.2" fill="currentColor" />
    </svg>
  );
}

export function Landing({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const l = dict.landing;
  const features = [
    { icon: <GitBranch />, t: l.f1t, b: l.f1b },
    { icon: <Activity />, t: l.f2t, b: l.f2b },
    { icon: <CalendarClock />, t: l.f3t, b: l.f3b },
    { icon: <Lock />, t: l.f4t, b: l.f4b },
  ];
  return (
    <>
      <PublicHeader lang={lang} dict={dict} />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-6 pt-20 pb-16 sm:pt-28">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{l.headline}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted text-pretty">{l.sub}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <DemoButton label={l.tryDemo} failedLabel={dict.auth.demoFailed} tooManyLabel={dict.auth.tooMany} />
            <ButtonLink href={`/${lang}/sign-up`} size="lg">
              {l.signUp}
            </ButtonLink>
          </div>
          <p className="mt-3 text-sm text-muted">{l.demoHint}</p>
          {/* Real screenshot of the demo dashboard (scripts: see docs/DEVELOPMENT.md). */}
          <div className="mt-14 overflow-hidden rounded-lg border border-border shadow-sm">
            <Image src="/product-light.png" alt={l.screenshotAlt} width={1440} height={720} priority className="block h-auto w-full dark:hidden" />
            <Image src="/product-dark.png" alt={l.screenshotAlt} width={1440} height={720} className="hidden h-auto w-full dark:block" />
          </div>
        </section>
        <section className="border-t border-border">
          <div className="mx-auto grid max-w-5xl gap-px overflow-hidden px-6 py-14 sm:grid-cols-2">
            {features.map((f) => (
              <div key={f.t} className="py-5 pr-8">
                <div className="mb-3 text-accent [&_svg]:size-5">{f.icon}</div>
                <h2 className="text-sm font-semibold">{f.t}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.b}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-muted">
          <span>{l.builtBy}</span>
          <a href={REPO} className="hover:text-fg" rel="noopener">
            {l.source}
          </a>
        </div>
      </footer>
    </>
  );
}
