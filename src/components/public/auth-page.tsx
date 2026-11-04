import Link from "next/link";
import { AuthForm } from "@/components/public/auth-form";
import { DemoButton } from "@/components/public/demo-button";
import { Logo } from "@/components/public/landing";
import type { Dictionary, Locale } from "@/lib/i18n";

export function AuthPage({ mode, lang, dict }: { mode: "sign-in" | "sign-up"; lang: Locale; dict: Dictionary }) {
  const a = dict.auth;
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href={lang === "en" ? "/" : "/fr"} className="mb-8 flex items-center gap-2 text-sm font-semibold">
          <Logo /> ApplyFlow
        </Link>
        <h1 className="mb-6 text-xl font-semibold tracking-tight">{mode === "sign-in" ? a.signInTitle : a.signUpTitle}</h1>
        <AuthForm mode={mode} dict={dict} />
        <p className="mt-6 text-sm text-muted">
          {mode === "sign-in" ? a.noAccount : a.haveAccount}{" "}
          <Link className="font-medium text-fg underline underline-offset-4" href={`/${lang}/${mode === "sign-in" ? "sign-up" : "sign-in"}`}>
            {mode === "sign-in" ? a.signUp : a.signIn}
          </Link>
        </p>
        {mode === "sign-in" ? <p className="mt-2 text-xs text-muted">{a.resetUnavailable}</p> : null}
        <div className="mt-8 border-t border-border pt-6">
          <p className="mb-3 text-sm text-muted">{a.orDemo}</p>
          <DemoButton label={dict.landing.tryDemo} failedLabel={a.demoFailed} tooManyLabel={a.tooMany} />
        </div>
      </div>
    </main>
  );
}
