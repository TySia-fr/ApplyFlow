import type { Metadata } from "next";
import { Landing } from "@/components/public/landing";
import { en } from "@/lib/i18n/en";

export const metadata: Metadata = {
  alternates: { canonical: "/", languages: { en: "/", fr: "/fr" } },
};

export default function Home() {
  return <Landing lang="en" dict={en} />;
}
