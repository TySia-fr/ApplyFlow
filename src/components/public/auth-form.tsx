"use client";

import { useActionState } from "react";
import { signInAction, signUpAction } from "@/server/actions/auth";
import { SubmitButton } from "@/components/forms";
import { Alert, Field, Input } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n";

export function AuthForm({ mode, dict }: { mode: "sign-in" | "sign-up"; dict: Dictionary }) {
  const [state, action] = useActionState(mode === "sign-in" ? signInAction : signUpAction, null);
  const a = dict.auth;
  const errorText: Record<string, string> = {
    invalidCredentials: a.invalidCredentials,
    tooMany: a.tooMany,
    verifyEmail: a.verifyEmail,
    signUpFailed: a.signUpFailed,
    generic: dict.common.genericError,
  };
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  const formError = state && !state.ok && state.error ? errorText[state.error] ?? dict.common.genericError : null;
  const verify = state?.ok && state.message === "verifyEmail";

  if (verify) return <Alert tone="info">{a.verifyEmail}</Alert>;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {formError ? <Alert>{formError}</Alert> : null}
      {mode === "sign-up" ? (
        <Field label={a.name} name="name" error={fields.name ? dict.errors.required : undefined}>
          {(p) => <Input {...p} autoComplete="name" required maxLength={100} />}
        </Field>
      ) : null}
      <Field label={a.email} name="email" error={fields.email ? dict.errors.invalid : undefined}>
        {(p) => <Input {...p} type="email" autoComplete="email" required maxLength={254} />}
      </Field>
      <Field
        label={a.password}
        name="password"
        hint={mode === "sign-up" ? a.passwordHint : undefined}
        error={fields.password ? a.passwordHint : undefined}
      >
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            required
            minLength={mode === "sign-up" ? 10 : undefined}
            maxLength={128}
          />
        )}
      </Field>
      <SubmitButton variant="primary" size="lg" pendingLabel={dict.common.saving}>
        {mode === "sign-in" ? a.signIn : a.signUp}
      </SubmitButton>
    </form>
  );
}
