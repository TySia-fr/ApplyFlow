import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current-user";
import { resumeOptions } from "@/server/services/documents";
import { getDictionary } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { ApplicationForm } from "@/components/app/application-form";

export const metadata: Metadata = { title: "New application" };

export default async function NewApplicationPage() {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const resumes = await resumeOptions(user.id);
  return (
    <>
      <PageHeader title={dict.applications.new} />
      <ApplicationForm dict={dict} resumes={resumes} cancelHref="/app/applications" />
    </>
  );
}
