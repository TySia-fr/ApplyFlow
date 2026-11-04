import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/server/auth";
import type { Locale } from "@/lib/i18n";

/**
 * The narrow user shape the app works with. Everything downstream receives
 * this, never the raw session, so no token can leak into a component prop.
 */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  locale: Locale;
  timezone: string;
  isDemo: boolean;
  demoExpiresAt: Date | null;
};

/**
 * Data Access Layer entry point. React `cache` dedupes it within a request, so
 * layouts and pages can all call it without extra DB round-trips.
 * Must be rendered behind a <Suspense> boundary (it reads request headers).
 */
export const getCurrentUserOrNull = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user;
  if (u.isDemo && u.demoExpiresAt && new Date(u.demoExpiresAt) < new Date()) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    locale: u.locale === "fr" ? "fr" : "en",
    timezone: u.timezone || "UTC",
    isDemo: Boolean(u.isDemo),
    demoExpiresAt: u.demoExpiresAt ? new Date(u.demoExpiresAt) : null,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUserOrNull();
  if (!user) redirect("/en/sign-in");
  return user;
}
