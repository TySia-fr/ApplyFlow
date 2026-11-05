import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  Database,
  GitBranch,
  FolderGit2,
  History,
  Languages,
  Lock,
  ShieldCheck,
  TestTubeDiagonal,
} from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { DemoButton } from "@/components/public/demo-button";
import type { Dictionary, Locale } from "@/lib/i18n";

const REPO = "https://github.com/TySia-fr/applyflow";

export function PublicHeader({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const other = lang === "en" ? "fr" : "en";
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
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
          <a href={REPO} rel="noopener" className="hidden rounded-md p-1.5 text-muted hover:text-fg sm:inline-flex" aria-label="GitHub">
            <FolderGit2 aria-hidden className="size-4" />
          </a>
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

/** Small decorative pipeline: the stages a card moves through. Pure SVG, no JS. */
function PipelineMark() {
  const stages = ["var(--border-strong)", "var(--info)", "var(--info)", "var(--violet)", "var(--violet)", "var(--success)"];
  return (
    <svg aria-hidden viewBox="0 0 240 16" className="h-3 w-48 text-border-strong">
      <line x1="8" y1="8" x2="232" y2="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" />
      {stages.map((c, i) => (
        <circle key={i} cx={8 + i * 44.8} cy="8" r={i === stages.length - 1 ? 6 : 4.5} fill={c} />
      ))}
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
  const steps = [
    { t: l.s1t, b: l.s1b },
    { t: l.s2t, b: l.s2b },
    { t: l.s3t, b: l.s3b },
  ];
  const engineering = [
    { icon: <Database />, t: l.e1t, b: l.e1b },
    { icon: <History />, t: l.e2t, b: l.e2b },
    { icon: <TestTubeDiagonal />, t: l.e3t, b: l.e3b },
    { icon: <Languages />, t: l.e4t, b: l.e4b },
  ];

  return (
    <div lang={lang} className="flex flex-1 flex-col">
      <PublicHeader lang={lang} dict={dict} />
      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--border-strong)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)] opacity-70"
          />
          <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-10 sm:pt-24">
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted shadow-xs">
              <PipelineMark />
              <span className="hidden sm:inline">{l.eyebrow}</span>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl sm:leading-[1.05]">
              {l.headlineA} <span className="text-accent">{l.headlineB}</span>
              {l.headlineC}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted text-pretty">{l.sub}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <DemoButton label={l.tryDemo} failedLabel={dict.auth.demoFailed} tooManyLabel={dict.auth.tooMany} />
              <ButtonLink href={`/${lang}/sign-up`} size="lg">
                {l.signUp}
              </ButtonLink>
            </div>
            <p className="mt-3 text-sm text-muted">{l.demoHint}</p>
          </div>

          {/* Real screenshot of the demo dashboard, framed as an app window. */}
          <div className="relative mx-auto max-w-6xl px-6 pb-20">
            <figure className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_24px_60px_-20px_rgb(0_0_0/0.25)]">
              <div aria-hidden className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="ml-3 rounded-md bg-surface px-2 py-0.5 text-[11px] text-muted">applyflow.siavashizadi.com/app</span>
              </div>
              <Image src="/product-light.png" alt={l.screenshotAlt} width={1440} height={720} priority className="block h-auto w-full dark:hidden" />
              <Image src="/product-dark.png" alt={l.screenshotAlt} width={1440} height={720} className="hidden h-auto w-full dark:block" />
            </figure>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.t}>
                <div className="mb-3 inline-flex size-8 items-center justify-center rounded-md bg-accent-soft text-accent [&_svg]:size-4">{f.icon}</div>
                <h2 className="text-sm font-semibold">{f.t}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">{l.howTitle}</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.t} className="relative rounded-lg border border-border bg-surface p-5">
                  <span className="font-mono text-xs text-accent">0{i + 1}</span>
                  <h3 className="mt-2 text-base font-semibold">{s.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.b}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Engineering */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                  <ShieldCheck aria-hidden className="size-4" /> {l.eyebrow}
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">{l.engTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{l.engSub}</p>
              </div>
              <ButtonLink href={`${REPO}/blob/main/docs/ARCHITECTURE.md`} rel="noopener" variant="secondary">
                <FolderGit2 aria-hidden /> {l.readDocs}
              </ButtonLink>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
              {engineering.map((e) => (
                <div key={e.t} className="bg-surface p-6">
                  <div className="mb-3 text-fg [&_svg]:size-5">{e.icon}</div>
                  <h3 className="text-sm font-semibold">{e.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{e.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-14">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{l.ctaTitle}</h2>
              <p className="mt-1 text-sm text-muted">{l.ctaBody}</p>
            </div>
            <div className="flex items-center gap-3">
              <DemoButton label={l.tryDemo} failedLabel={dict.auth.demoFailed} tooManyLabel={dict.auth.tooMany} />
              <ButtonLink href={`/${lang}/sign-up`} size="lg" variant="ghost">
                {l.signUp} <ArrowRight aria-hidden />
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-muted">
          <span className="flex items-center gap-2">
            <Logo /> {l.builtBy}
          </span>
          <a href={REPO} className="hover:text-fg" rel="noopener">
            {l.source}
          </a>
        </div>
      </footer>
    </div>
  );
}
