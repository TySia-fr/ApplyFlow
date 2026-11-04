import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current-user";
import { getDictionary } from "@/lib/i18n";
import { PageHeader, Panel, PanelHeader } from "@/components/ui";
import { DeleteAccountForm, PasswordForm, ProfileForm } from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const s = dict.settings;
  return (
    <>
      <PageHeader title={s.title} description={user.isDemo ? undefined : user.email} />
      <div className="space-y-4">
        <Panel>
          <PanelHeader title={s.profile} />
          <div className="p-4"><ProfileForm dict={dict} name={user.name} locale={user.locale} timezone={user.timezone} /></div>
        </Panel>
        <Panel>
          <PanelHeader title={s.password} />
          <div className="p-4">{user.isDemo ? <p className="text-sm text-muted">{s.demoNoPassword}</p> : <PasswordForm dict={dict} />}</div>
        </Panel>
        <Panel className="border-danger/40">
          <PanelHeader title={s.danger} />
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted">{s.dangerBody}</p>
            <DeleteAccountForm dict={dict} />
          </div>
        </Panel>
      </div>
    </>
  );
}
