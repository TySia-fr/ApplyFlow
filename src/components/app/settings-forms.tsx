"use client";

import { useActionState } from "react";
import { changePasswordAction, deleteAccountAction, updateSettingsAction } from "@/server/actions/workflow";
import { SubmitButton } from "@/components/forms";
import { Alert, Field, Input, Select } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n";

export function ProfileForm({ dict, name, locale, timezone }: { dict: Dictionary; name: string; locale: string; timezone: string }) {
  const [state, action] = useActionState(updateSettingsAction, null);
  const s = dict.settings;
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [timezone];
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <Field label={dict.auth.name} name="name" error={fields.name ? dict.errors.required : undefined}>
        {(p) => <Input {...p} defaultValue={name} required maxLength={100} />}
      </Field>
      <Field label={s.language} name="locale">
        {(p) => (
          <Select {...p} defaultValue={locale}>
            <option value="en">English</option>
            <option value="fr">Français</option>
          </Select>
        )}
      </Field>
      <Field label={s.timezone} name="timezone" hint={s.timezoneHint} error={fields.timezone ? dict.errors.fieldInvalid : undefined}>
        {(p) => (
          <Select {...p} defaultValue={timezone}>
            {zones.includes(timezone) ? null : <option value={timezone}>{timezone}</option>}
            {zones.map((z) => <option key={z} value={z}>{z.replaceAll("_", " ")}</option>)}
          </Select>
        )}
      </Field>
      <div className="flex items-center gap-3 sm:col-span-3">
        <SubmitButton variant="primary" pendingLabel={dict.common.saving}>{dict.common.save}</SubmitButton>
        {state?.ok ? <span role="status" className="text-sm text-success">{s.saved}</span> : null}
      </div>
    </form>
  );
}

export function PasswordForm({ dict }: { dict: Dictionary }) {
  const [state, action] = useActionState(changePasswordAction, null);
  const s = dict.settings;
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3 sm:items-start">
      {state?.ok ? <div className="sm:col-span-3"><Alert tone="success">{s.passwordChanged}</Alert></div> : null}
      {state && !state.ok && state.error === "rateLimited" ? <div className="sm:col-span-3"><Alert>{dict.auth.tooMany}</Alert></div> : null}
      <Field label={s.currentPassword} name="currentPassword" error={fields.currentPassword ? s.passwordWrong : undefined}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" required />}
      </Field>
      <Field label={s.newPassword} name="newPassword" hint={dict.auth.passwordHint} error={fields.newPassword ? dict.auth.passwordHint : undefined}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" minLength={10} maxLength={128} required />}
      </Field>
      <div className="sm:pt-6">
        <SubmitButton pendingLabel={dict.common.saving}>{s.changePassword}</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteAccountForm({ dict }: { dict: Dictionary }) {
  const [state, action] = useActionState(deleteAccountAction, null);
  const s = dict.settings;
  const bad = state && !state.ok && state.fields?.confirm;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label={s.typeToConfirm} name="confirm" error={bad ? s.typeToConfirm : undefined}>
        {(p) => <Input {...p} autoComplete="off" className="w-48" />}
      </Field>
      <SubmitButton variant="danger" pendingLabel={dict.common.saving}>{s.deleteAccount}</SubmitButton>
    </form>
  );
}
