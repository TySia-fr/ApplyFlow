import type { Metadata } from "next";
import { AuthPage } from "@/components/public/auth-page";
import { getDictionary, type Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignUp({ params }: PageProps<"/[lang]/sign-up">) {
  const { lang } = await params;
  return <AuthPage mode="sign-up" lang={lang as Locale} dict={getDictionary(lang)} />;
}
