import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { DemoButton } from "@/components/public/demo-button";
import type { Dictionary, Locale } from "@/lib/i18n";

const REPO = "https://github.com/TySia-fr/ApplyFlow";

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

/** Static illustration of a bot exchange; the wording is the bot's own, the offer is sample data. */
function ChatPreview({ dict }: { dict: Dictionary }) {
  const l = dict.landing;
  return (
    <figure className="w-full max-w-sm">
      <div className="rounded-2xl border border-border bg-surface-2 p-4 text-[13px] leading-snug" aria-hidden>
        <div className="mb-3 text-center text-[11px] font-medium text-muted">@ApplyFlowAppBot</div>
        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-accent-fg">{l.chatUser}</div>
        <div className="mt-2 w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-fg shadow-xs">
          {l.chatBot} <b>Alternant DevOps</b> · Orbital Rail
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <span className="rounded-md bg-surface-2 px-2 py-1 text-center text-xs text-accent">{l.chatApplied}</span>
            <span className="rounded-md bg-surface-2 px-2 py-1 text-center text-xs text-accent">{l.chatOpen}</span>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-muted">{l.chatCaption}</figcaption>
    </figure>
  );
}

export function Landing({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const l = dict.landing;
  const week = [
    { t: l.d1, b: l.d1b },
    { t: l.d2, b: l.d2b },
    { t: l.d3, b: l.d3b },
    { t: l.d4, b: l.d4b },
  ];
  const notes = [
    { t: l.n1t, b: l.n1b },
    { t: l.n2t, b: l.n2b },
    { t: l.n3t, b: l.n3b },
    { t: l.n4t, b: l.n4b },
  ];
  const demo = <DemoButton label={l.tryDemo} failedLabel={dict.auth.demoFailed} tooManyLabel={dict.auth.tooMany} />;

  return (
    <div lang={lang} className="flex flex-1 flex-col">
      <PublicHeader lang={lang} dict={dict} />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24">
          <p className="text-sm text-muted">{l.kicker}</p>
          <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[1.02] tracking-tight text-balance sm:text-7xl">
            {l.headlineA} <em className="text-accent">{l.headlineB}</em>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty">{l.sub}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {demo}
            <ButtonLink href={`/${lang}/sign-up`} size="lg" variant="ghost">
              {l.signUp}
            </ButtonLink>
          </div>
          <p className="mt-3 text-sm text-muted">{l.demoHint}</p>
          <p className="mt-10 max-w-xl border-l-2 border-accent pl-4 text-[15px] leading-relaxed text-muted">{l.maker}</p>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-20">
          <figure>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <Image src="/product-light.png" alt={l.screenshotAlt} width={1440} height={720} priority className="block h-auto w-full dark:hidden" />
              <Image src="/product-dark.png" alt={l.screenshotAlt} width={1440} height={720} className="hidden h-auto w-full dark:block" />
            </div>
            <figcaption className="mt-3 text-xs text-muted">{l.screenshotCaption}</figcaption>
          </figure>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto grid max-w-5xl gap-12 px-6 py-20 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="font-serif text-4xl tracking-tight">{l.weekTitle}</h2>
              <ol className="mt-10 space-y-8">
                {week.map((w) => (
                  <li key={w.t} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-6">
                    <h3 className="text-sm font-semibold text-accent">{w.t}</h3>
                    <p className="max-w-lg leading-relaxed">{w.b}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="md:pt-20">
              <ChatPreview dict={dict} />
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <h2 className="font-serif text-4xl tracking-tight">{l.notesTitle}</h2>
            <p className="mt-3 max-w-xl text-muted">{l.notesSub}</p>
            <dl className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-2">
              {notes.map((n) => (
                <div key={n.t}>
                  <dt className="font-medium">{n.t}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-muted">{n.b}</dd>
                </div>
              ))}
            </dl>
            <a
              href={`${REPO}/blob/main/docs/ARCHITECTURE.md`}
              rel="noopener"
              className="mt-10 inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              {l.readDocs} <ArrowUpRight aria-hidden className="size-4" />
            </a>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-6 px-6 py-16">
            <div>
              <h2 className="font-serif text-3xl tracking-tight">{l.ctaTitle}</h2>
              <p className="mt-2 text-muted">{l.ctaBody}</p>
            </div>
            {demo}
          </div>
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-muted">
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
