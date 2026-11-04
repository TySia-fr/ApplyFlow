import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function LangLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!(LOCALES as readonly string[]).includes(lang)) notFound();
  return children;
}
