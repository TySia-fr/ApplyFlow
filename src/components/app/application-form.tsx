"use client";

import { useActionState } from "react";
import { createApplicationAction, updateApplicationAction } from "@/server/actions/applications";
import { SubmitButton } from "@/components/forms";
import { Alert, ButtonLink, Field, Input, Panel, Select, Textarea } from "@/components/ui";
import { EMPLOYMENT_TYPES, PRIORITIES, STATUSES, WORK_MODES } from "@/lib/applications/status";
import type { Dictionary } from "@/lib/i18n";
import type { ActionState } from "@/server/errors";

export type ApplicationDefaults = Partial<Record<string, string>>;

/**
 * One form for create and edit. Values are uncontrolled (defaultValue) and
 * React 19 keeps them after a failed submit, so the user never loses input.
 */
export function ApplicationForm({
  dict,
  id,
  defaults = {},
  resumes,
  cancelHref,
}: {
  dict: Dictionary;
  id?: string;
  defaults?: ApplicationDefaults;
  resumes: { id: string; title: string; version: number }[];
  cancelHref: string;
}) {
  const action = id ? updateApplicationAction.bind(null, id) : createApplicationAction;
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const err = state && !state.ok ? (state.fields ?? {}) : {};
  const f = dict.fields;
  const o = dict.common.optional;
  const e = (k: string) => {
    const msg = err[k];
    if (!msg) return undefined;
    if (msg === "Required") return dict.errors.required;
    if (msg.startsWith("Minimum must")) return dict.errors.salaryRange;
    return dict.errors.fieldInvalid;
  };

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok ? <Alert>{state.error ? dict.common.genericError : dict.errors.invalid}</Alert> : null}

      <Panel className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label={f.title} name="title" error={e("title")}>
          {(p) => <Input {...p} required maxLength={200} defaultValue={defaults.title} autoFocus={!id} />}
        </Field>
        <Field label={f.company} name="companyName" error={e("companyName")}>
          {(p) => <Input {...p} required maxLength={200} defaultValue={defaults.companyName} />}
        </Field>
        <Field label={f.status} name="status" error={e("status")}>
          {(p) => (
            <Select {...p} defaultValue={defaults.status ?? "interested"}>
              {STATUSES.map((s) => <option key={s} value={s}>{dict.status[s]}</option>)}
            </Select>
          )}
        </Field>
        <Field label={f.priority} name="priority" error={e("priority")}>
          {(p) => (
            <Select {...p} defaultValue={defaults.priority ?? "medium"}>
              {PRIORITIES.map((s) => <option key={s} value={s}>{dict.priority[s]}</option>)}
            </Select>
          )}
        </Field>
        <Field label={f.jobUrl} name="jobUrl" error={e("jobUrl")} optionalLabel={o}>
          {(p) => <Input {...p} type="url" inputMode="url" placeholder="https://" defaultValue={defaults.jobUrl} />}
        </Field>
        <Field label={f.companyWebsite} name="companyWebsite" error={e("companyWebsite")} optionalLabel={o}>
          {(p) => <Input {...p} type="url" inputMode="url" placeholder="https://" defaultValue={defaults.companyWebsite} />}
        </Field>
      </Panel>

      <Panel className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={f.location} name="location" error={e("location")} optionalLabel={o}>
          {(p) => <Input {...p} maxLength={200} defaultValue={defaults.location} />}
        </Field>
        <Field label={f.country} name="country" error={e("country")} optionalLabel={o}>
          {(p) => <Input {...p} maxLength={100} defaultValue={defaults.country} />}
        </Field>
        <Field label={f.workMode} name="workMode" error={e("workMode")} optionalLabel={o}>
          {(p) => (
            <Select {...p} defaultValue={defaults.workMode ?? ""}>
              <option value="">—</option>
              {WORK_MODES.map((s) => <option key={s} value={s}>{dict.workMode[s]}</option>)}
            </Select>
          )}
        </Field>
        <Field label={f.employmentType} name="employmentType" error={e("employmentType")} optionalLabel={o}>
          {(p) => (
            <Select {...p} defaultValue={defaults.employmentType ?? ""}>
              <option value="">—</option>
              {EMPLOYMENT_TYPES.map((s) => <option key={s} value={s}>{dict.employmentType[s]}</option>)}
            </Select>
          )}
        </Field>
        <Field label={f.salaryMin} name="salaryMin" error={e("salaryMin")} optionalLabel={o}>
          {(p) => <Input {...p} type="number" min={0} step={1} inputMode="numeric" defaultValue={defaults.salaryMin} />}
        </Field>
        <Field label={f.salaryMax} name="salaryMax" error={e("salaryMax")} optionalLabel={o}>
          {(p) => <Input {...p} type="number" min={0} step={1} inputMode="numeric" defaultValue={defaults.salaryMax} />}
        </Field>
        <Field label={f.currency} name="currency" error={e("currency")} optionalLabel={o}>
          {(p) => <Input {...p} maxLength={3} placeholder="EUR" className="uppercase" defaultValue={defaults.currency} />}
        </Field>
        <Field label={f.source} name="source" error={e("source")} optionalLabel={o}>
          {(p) => <Input {...p} maxLength={100} placeholder={f.sourcePlaceholder} defaultValue={defaults.source} />}
        </Field>
        <Field label={f.appliedAt} name="appliedAt" error={e("appliedAt")} optionalLabel={o}>
          {(p) => <Input {...p} type="date" defaultValue={defaults.appliedAt} />}
        </Field>
        <Field label={f.deadline} name="deadline" error={e("deadline")} optionalLabel={o}>
          {(p) => <Input {...p} type="date" defaultValue={defaults.deadline} />}
        </Field>
        <Field label={f.resume} name="resumeId" error={e("resumeId")} optionalLabel={o} className="sm:col-span-2">
          {(p) => (
            <Select {...p} defaultValue={defaults.resumeId ?? ""}>
              <option value="">{dict.common.none}</option>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>{r.title} (v{r.version})</option>
              ))}
            </Select>
          )}
        </Field>
      </Panel>

      <Panel className="grid gap-4 p-4">
        <Field label={f.description} name="description" error={e("description")} optionalLabel={o}>
          {(p) => <Textarea {...p} rows={6} maxLength={20000} defaultValue={defaults.description} />}
        </Field>
        <Field label={f.notes} name="notes" error={e("notes")} optionalLabel={o}>
          {(p) => <Textarea {...p} rows={3} maxLength={10000} defaultValue={defaults.notes} />}
        </Field>
      </Panel>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="ghost">{dict.common.cancel}</ButtonLink>
        <SubmitButton variant="primary" pendingLabel={dict.common.saving}>
          {id ? dict.common.save : dict.common.create}
        </SubmitButton>
      </div>
    </form>
  );
}
