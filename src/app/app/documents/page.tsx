import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { listDocuments } from "@/server/services/documents";
import { deleteDocumentAction } from "@/server/actions/workflow";
import { getDictionary } from "@/lib/i18n";
import { formatDate } from "@/lib/time";
import { Badge, EmptyState, PageHeader, Panel, PanelHeader, buttonVariants } from "@/components/ui";
import { ConfirmButton } from "@/components/forms";
import { UploadForm } from "@/components/app/workflow-forms";

export const metadata: Metadata = { title: "Documents" };

function size(bytes: number, locale: string) {
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return bytes < 1024 * 1024 ? `${fmt.format(bytes / 1024)} KB` : `${fmt.format(bytes / 1024 / 1024)} MB`;
}

export default async function DocumentsPage() {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const d = dict.documents;
  const docs = await listDocuments(user.id);

  return (
    <>
      <PageHeader title={d.title} description={d.privateNote} />
      <Panel className="mb-4">
        <PanelHeader title={d.upload} />
        <div className="p-4"><UploadForm dict={dict} /></div>
      </Panel>
      <Panel>
        {docs.length === 0 ? (
          <EmptyState icon={<FileText />} title={d.emptyTitle} body={d.emptyBody} />
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{doc.title}</span>
                    <Badge>{d.kinds[doc.kind]}</Badge>
                    <span className="text-xs text-muted">v{doc.version}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {[doc.targetRole, size(doc.sizeBytes, user.locale), `${d.uploaded} ${formatDate(doc.createdAt, user.locale, user.timezone)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Plain link: the route handler checks the session and ownership. */}
                  <a href={`/api/documents/${doc.id}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                    <Download aria-hidden /> {d.download}
                  </a>
                  <form action={deleteDocumentAction}>
                    <input type="hidden" name="id" value={doc.id} />
                    <ConfirmButton label={dict.common.delete} confirmLabel={dict.common.delete} cancelLabel={dict.common.cancel} description={d.deleteConfirm} />
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
