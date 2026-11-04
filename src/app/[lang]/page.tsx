import type { Metadata } from "next";
import { Landing } from "@/components/public/landing";
import { getDictionary, type Locale } from "@/lib/i18n";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  return {
    description: getDictionary(lang).meta.tagline,
    alternates: { canonical: lang === "en" ? "/" : "/fr", languages: { en: "/", fr: "/fr" } },
  };
}

export default async function LocalizedLanding({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  return <Landing lang={lang as Locale} dict={getDictionary(lang)} />;
}
