"use client";

import { useActionState, useEffect, useRef } from "react";
import { createSavedSearchAction, createTelegramLinkAction, runSavedSearchAction, type LinkState, type RunState } from "@/server/actions/discovery";
import { SubmitButton } from "@/components/forms";
import { Alert, ButtonLink, Field, Input, Select } from "@/components/ui";
import { DIPLOMA_LEVELS, JOB_FAMILY_KEYS } from "@/lib/discovery";
import { t, type Dictionary } from "@/lib/i18n";
import { Send } from "lucide-react";

export function SavedSearchForm({ dict }: { dict: Dictionary }) {
  const [state, action] = useActionState(createSavedSearchAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  const d = dict.discover;
  const f = state && !state.ok ? (state.fields ?? {}) : {};
  return (
    <form ref={ref} action={action} className="grid gap-4" noValidate>
      {f._form === "tooManySearches" ? <Alert>{d.tooMany}</Alert> : null}
      <Field label={d.name} name="name" error={f.name ? dict.errors.required : undefined}>
        {(p) => <Input {...p} required maxLength={80} placeholder={d.namePlaceholder} />}
      </Field>
      <Field label={d.departements} name="departements" hint={d.departementsHint} error={f.departements ? dict.errors.fieldInvalid : undefined}>
        {(p) => <Input {...p} required placeholder="34, 30" inputMode="text" />}
      </Field>
      <fieldset aria-describedby={f.families ? "families-err" : undefined}>
        <legend className="mb-1.5 text-[13px] font-medium">{d.families}</legend>
        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {JOB_FAMILY_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="families" value={k} className="accent-accent" defaultChecked={k === "software_dev"} />
              {dict.families[k]}
            </label>
          ))}
        </div>
        {f.families ? <p id="families-err" className="mt-1 text-xs text-danger">{dict.errors.required}</p> : null}
      </fieldset>
      <Field label={d.level} name="diplomaLevel">
        {(p) => (
          <Select {...p} defaultValue="6">
            {DIPLOMA_LEVELS.map((l) => <option key={l} value={l}>{d.levels[String(l) as keyof typeof d.levels]}</option>)}
          </Select>
        )}
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notifyTelegram" defaultChecked className="accent-accent" />
        {d.notify}
      </label>
      <div>
        <SubmitButton variant="primary" pendingLabel={dict.common.saving}>{d.create}</SubmitButton>
      </div>
    </form>
  );
}

export function RunSearchButton({ dict, id }: { dict: Dictionary; id: string }) {
  const [state, action] = useActionState<RunState, FormData>(runSavedSearchAction, null);
  const d = dict.discover;
  const message =
    state?.ok === true
      ? t(d.runResult, { found: state.found, added: state.added })
      : state?.ok === false
        ? state.error === "rateLimited"
          ? d.rateLimited
          : state.error === "notConfigured"
            ? d.notConfigured
            : t(d.runFailed, { error: state.error })
        : null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" pendingLabel={`${d.runNow}…`}>{d.runNow}</SubmitButton>
      {message ? <span role="status" className={state?.ok ? "text-xs text-success" : "text-xs text-danger"}>{message}</span> : null}
    </form>
  );
}

export function TelegramConnect({ dict }: { dict: Dictionary }) {
  const [state, action] = useActionState<LinkState, FormData>(createTelegramLinkAction, null);
  const tg = dict.telegram;
  if (state?.ok) {
    return (
      <div className="space-y-2">
        <ButtonLink href={state.url} target="_blank" rel="noopener noreferrer" variant="primary">
          <Send aria-hidden /> {tg.openLink}
        </ButtonLink>
        <p className="text-xs text-muted">{tg.linkHint}</p>
      </div>
    );
  }
  return (
    <form action={action}>
      <SubmitButton variant="primary" pendingLabel={dict.common.saving}>
        <Send aria-hidden /> {tg.connect}
      </SubmitButton>
      {state && !state.ok ? <p role="alert" className="mt-2 text-xs text-danger">{state.error === "demo" ? tg.demoNote : tg.notConfigured}</p> : null}
    </form>
  );
}
