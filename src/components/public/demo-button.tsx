"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { startDemoAction } from "@/server/actions/auth";
import { SubmitButton } from "@/components/forms";

export function DemoButton({ label, failedLabel, tooManyLabel }: { label: string; failedLabel: string; tooManyLabel: string }) {
  const [state, action] = useActionState(startDemoAction, null);
  const error = state && !state.ok ? (state.error === "tooMany" ? tooManyLabel : failedLabel) : null;
  return (
    <form action={action} className="flex flex-col gap-2">
      <SubmitButton variant="primary" size="lg" pendingLabel={`${label}…`}>
        {label} <ArrowRight aria-hidden />
      </SubmitButton>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
