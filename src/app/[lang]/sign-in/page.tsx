import type { Metadata } from "next";
import { AuthPage } from "@/components/public/auth-page";
import { getDictionary, type Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignIn({ params }: PageProps<"/[lang]/sign-in">) {
  const { lang } = await params;
  return <AuthPage mode="sign-in" lang={lang as Locale} dict={getDictionary(lang)} />;
}
