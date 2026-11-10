import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current-user";
import { telegramEnabled } from "@/server/env";
import { getLink } from "@/server/services/telegram";
import { unlinkTelegramAction } from "@/server/actions/discovery";
import { SubmitButton } from "@/components/forms";
import { TelegramConnect } from "@/components/app/discover-forms";
import { getDictionary } from "@/lib/i18n";
import { PageHeader, Panel, PanelHeader } from "@/components/ui";
import { DeleteAccountForm, PasswordForm, ProfileForm } from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const dict = getDictionary(user.locale);
  const s = dict.settings;
  const tg = dict.telegram;
  const link = telegramEnabled && !user.isDemo ? await getLink(user.id) : null;
  return (
    <>
      <PageHeader title={s.title} description={user.isDemo ? undefined : user.email} />
      <div className="space-y-4">
        <Panel>
          <PanelHeader title={s.profile} />
          <div className="p-4"><ProfileForm dict={dict} name={user.name} locale={user.locale} timezone={user.timezone} /></div>
        </Panel>
        <Panel>
          <PanelHeader title={tg.title} />
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted">{tg.description}</p>
            {!telegramEnabled ? (
              <p className="text-sm text-muted">{tg.notConfigured}</p>
            ) : user.isDemo ? (
              <p className="text-sm text-muted">{tg.demoNote}</p>
            ) : link ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-success">{tg.connected.replace("{username}", link.username ? ` (@${link.username})` : "")}</span>
                <form action={unlinkTelegramAction}>
                  <SubmitButton size="sm" variant="danger">{tg.disconnect}</SubmitButton>
                </form>
              </div>
            ) : (
              <TelegramConnect dict={dict} />
            )}
          </div>
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
