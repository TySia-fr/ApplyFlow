"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { changeStatusAction } from "@/server/actions/applications";
import {
  createFollowUpAction,
  createInterviewAction,
  updateInterviewAction,
  uploadDocumentAction,
} from "@/server/actions/workflow";
import { SubmitButton } from "@/components/forms";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { STATUSES, type Status } from "@/lib/applications/status";
import { DOCUMENT_KINDS, INTERVIEW_OUTCOMES, INTERVIEW_TYPES } from "@/lib/validation";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import type { Dictionary } from "@/lib/i18n";
import type { ActionState } from "@/server/errors";

type Act = (s: ActionState, fd: FormData) => Promise<ActionState>;

/** useActionState + reset the form after a successful submit. */
function useResettingAction(action: Act) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  return { state, formAction, ref, fields };
}

function fieldMsg(dict: Dictionary, msg: string | undefined) {
  if (!msg) return undefined;
  return msg === "Required" ? dict.errors.required : dict.errors.fieldInvalid;
}

export function StatusChangeForm({ dict, applicationId, current }: { dict: Dictionary; applicationId: string; current: Status }) {
  const { state, formAction, ref } = useResettingAction(changeStatusAction);
  const a = dict.applications;
  return (
    <form ref={ref} action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="status-change" className="text-[13px] font-medium">{a.changeStatus}</label>
        <Select id="status-change" name="status" defaultValue={current} key={current} className="w-52">
          {STATUSES.map((s) => <option key={s} value={s}>{dict.status[s]}</option>)}
        </Select>
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <label htmlFor="status-note" className="text-[13px] font-medium">{a.statusNote}</label>
        <Input id="status-note" name="note" maxLength={1000} />
      </div>
      <SubmitButton variant="primary" pendingLabel={dict.common.saving}>{a.update}</SubmitButton>
      {state && !state.ok ? <p role="alert" className="w-full text-sm text-danger">{dict.common.genericError}</p> : null}
    </form>
  );
}

export function InterviewForm({ dict, applicationId, defaultTimezone }: { dict: Dictionary; applicationId: string; defaultTimezone: string }) {
  const { state, formAction, ref, fields } = useResettingAction(createInterviewAction);
  const [open, setOpen] = useState(false);
  const i = dict.interviews;
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>{i.schedule}</Button>;
  return (
    <form ref={ref} action={formAction} className="grid gap-3 sm:grid-cols-2" noValidate>
      <input type="hidden" name="applicationId" value={applicationId} />
      <Field label={i.type} name="type" error={fieldMsg(dict, fields.type)}>
        {(p) => (
          <Select {...p} defaultValue="video">
            {INTERVIEW_TYPES.map((tp) => <option key={tp} value={tp}>{i.types[tp]}</option>)}
          </Select>
        )}
      </Field>
      <Field label={i.when} name="localDateTime" error={fieldMsg(dict, fields.localDateTime)}>
        {(p) => <Input {...p} type="datetime-local" required />}
      </Field>
      <Field label={i.timezone} name="timezone" error={fieldMsg(dict, fields.timezone)}>
        {(p) => <Input {...p} defaultValue={defaultTimezone} required list="tz-list" />}
      </Field>
      <Field label={i.duration} name="durationMinutes" error={fieldMsg(dict, fields.durationMinutes)}>
        {(p) => <Input {...p} type="number" min={5} max={600} step={5} defaultValue={60} />}
      </Field>
      <Field label={i.location} name="locationOrUrl" optionalLabel={dict.common.optional} className="sm:col-span-2">
        {(p) => <Input {...p} maxLength={500} />}
      </Field>
      <Field label={i.participants} name="participants" optionalLabel={dict.common.optional} className="sm:col-span-2">
        {(p) => <Input {...p} maxLength={500} />}
      </Field>
      <Field label={i.preparation} name="preparationNotes" optionalLabel={dict.common.optional}>
        {(p) => <Textarea {...p} rows={3} maxLength={10000} />}
      </Field>
      <Field label={i.questions} name="questionsToAsk" optionalLabel={dict.common.optional}>
        {(p) => <Textarea {...p} rows={3} maxLength={5000} />}
      </Field>
      <TimezoneList />
      {state?.ok ? <div className="sm:col-span-2"><Alert tone="success">{dict.settings.saved}</Alert></div> : null}
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton variant="primary" size="sm" pendingLabel={dict.common.saving}>{i.schedule}</SubmitButton>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>{dict.common.cancel}</Button>
      </div>
    </form>
  );
}

export function OutcomeForm({
  dict,
  interviewId,
  outcome,
  feedback,
}: {
  dict: Dictionary;
  interviewId: string;
  outcome: (typeof INTERVIEW_OUTCOMES)[number];
  feedback: string | null;
}) {
  const [state, formAction] = useActionState(updateInterviewAction, null);
  const i = dict.interviews;
  return (
    <form action={formAction} className="mt-3 grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
      <input type="hidden" name="interviewId" value={interviewId} />
      <Field label={i.outcome} name={`outcome-${interviewId}`}>
        {(p) => (
          <Select id={p.id} name="outcome" defaultValue={outcome}>
            {INTERVIEW_OUTCOMES.map((o) => <option key={o} value={o}>{i.outcomes[o]}</option>)}
          </Select>
        )}
      </Field>
      <Field label={i.feedback} name={`feedback-${interviewId}`}>
        {(p) => <Input id={p.id} name="feedback" maxLength={10000} defaultValue={feedback ?? ""} />}
      </Field>
      <SubmitButton size="md" pendingLabel={dict.common.saving}>{i.saveOutcome}</SubmitButton>
      {state?.ok ? <p role="status" className="text-xs text-success sm:col-span-3">{dict.settings.saved}</p> : null}
    </form>
  );
}

export function FollowUpForm({
  dict,
  applicationId,
  applications,
}: {
  dict: Dictionary;
  applicationId?: string;
  applications?: { id: string; title: string; companyName: string }[];
}) {
  const { formAction, ref, fields } = useResettingAction(createFollowUpAction);
  const fu = dict.followUps;
  return (
    <form ref={ref} action={formAction} className="flex flex-wrap items-end gap-2" noValidate>
      {applicationId ? <input type="hidden" name="applicationId" value={applicationId} /> : null}
      <Field label={fu.what} name="title" error={fieldMsg(dict, fields.title)} className="min-w-56 flex-1">
        {(p) => <Input {...p} required maxLength={300} placeholder={fu.whatPlaceholder} />}
      </Field>
      {applications ? (
        <Field label={dict.nav.applications} name="applicationId" optionalLabel={dict.common.optional} className="w-60">
          {(p) => (
            <Select {...p} defaultValue="">
              <option value="">{fu.general}</option>
              {applications.map((a) => <option key={a.id} value={a.id}>{a.companyName} · {a.title}</option>)}
            </Select>
          )}
        </Field>
      ) : null}
      <Field label={fu.due} name="dueDate" error={fieldMsg(dict, fields.dueDate)}>
        {(p) => <Input {...p} type="date" required className="w-40" />}
      </Field>
      <SubmitButton variant="primary" pendingLabel={dict.common.saving}>{fu.add}</SubmitButton>
    </form>
  );
}

export function UploadForm({ dict }: { dict: Dictionary }) {
  const { state, formAction, ref, fields } = useResettingAction(uploadDocumentAction);
  const [clientError, setClientError] = useState<string | null>(null);
  const d = dict.documents;
  const fileErr = clientError ?? (fields.file ? (d[fields.file as "tooLarge" | "badType" | "noFile"] ?? d.badType) : undefined);
  return (
    <form
      ref={ref}
      action={formAction}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-start"
      noValidate
      onSubmit={(ev) => {
        // Fast feedback only; the server re-checks size and content type.
        const input = ev.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
        const f = input?.files?.[0];
        if (!f) { ev.preventDefault(); setClientError(d.noFile); return; }
        if (f.size > MAX_UPLOAD_BYTES) { ev.preventDefault(); setClientError(d.tooLarge); return; }
        setClientError(null);
      }}
    >
      <Field label={d.file} name="file" error={fileErr} hint={d.fileHint} className="sm:col-span-2 lg:col-span-4">
        {(p) => (
          <Input
            {...p}
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
            className="h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-sm"
          />
        )}
      </Field>
      <Field label={d.kind} name="kind">
        {(p) => (
          <Select {...p} defaultValue="resume">
            {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{d.kinds[k]}</option>)}
          </Select>
        )}
      </Field>
      <Field label={d.docTitle} name="title" error={fieldMsg(dict, fields.title)}>
        {(p) => <Input {...p} required maxLength={200} />}
      </Field>
      <Field label={d.targetRole} name="targetRole" optionalLabel={dict.common.optional}>
        {(p) => <Input {...p} maxLength={200} />}
      </Field>
      <div className="flex items-end lg:pt-6">
        <SubmitButton variant="primary" pendingLabel={dict.common.saving}>{d.upload}</SubmitButton>
      </div>
      {state && !state.ok && state.error ? <div className="sm:col-span-2 lg:col-span-4"><Alert>{dict.common.genericError}</Alert></div> : null}
    </form>
  );
}

function TimezoneList() {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return (
    <datalist id="tz-list">
      {zones.map((z) => <option key={z} value={z} />)}
    </datalist>
  );
}
