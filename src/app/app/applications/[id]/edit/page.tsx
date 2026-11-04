import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { getApplication } from "@/server/services/applications";
import { resumeOptions } from "@/server/services/documents";
import { NotFoundError } from "@/server/errors";
import { getDictionary } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { ApplicationForm } from "@/components/app/application-form";

export const metadata: Metadata = { title: "Edit application" };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined);

export default async function EditApplicationPage({ params }: PageProps<"/app/applications/[id]/edit">) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const dict = getDictionary(user.locale);
  const data = await getApplication(user.id, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const resumes = await resumeOptions(user.id);
  const a = data.app;
  return (
    <>
      <PageHeader title={dict.applications.edit} description={`${data.companyName} · ${a.title}`} />
      <ApplicationForm
        dict={dict}
        id={a.id}
        resumes={resumes}
        cancelHref={`/app/applications/${a.id}`}
        defaults={{
          title: a.title,
          companyName: data.companyName,
          companyWebsite: data.companyWebsite ?? undefined,
          status: a.status,
          priority: a.priority,
          jobUrl: a.jobUrl ?? undefined,
          location: a.location ?? undefined,
          country: a.country ?? undefined,
          workMode: a.workMode ?? undefined,
          employmentType: a.employmentType ?? undefined,
          salaryMin: a.salaryMin?.toString(),
          salaryMax: a.salaryMax?.toString(),
          currency: a.currency ?? undefined,
          source: a.source ?? undefined,
          appliedAt: day(a.appliedAt),
          deadline: day(a.deadline),
          resumeId: a.resumeId ?? undefined,
          description: a.description ?? undefined,
          notes: a.notes ?? undefined,
        }}
      />
    </>
  );
}
