import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { listBoard } from "@/server/services/applications";
import { getDictionary } from "@/lib/i18n";
import { ButtonLink, PageHeader } from "@/components/ui";
import { Board } from "@/components/app/board";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage() {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const rows = await listBoard(user.id);
  return (
    <>
      <PageHeader
        title={dict.applications.board}
        actions={
          <>
            <ButtonLink href="/app/applications">{dict.applications.table}</ButtonLink>
            <ButtonLink href="/app/applications/new" variant="primary"><Plus aria-hidden /> {dict.applications.new}</ButtonLink>
          </>
        }
      />
      <Board
        dict={dict}
        initial={rows.map((r) => ({
          id: r.id,
          title: r.title,
          companyName: r.companyName,
          status: r.status,
          priority: r.priority,
          location: r.location,
        }))}
      />
    </>
  );
}
