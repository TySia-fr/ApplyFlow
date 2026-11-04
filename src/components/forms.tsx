"use client";

import { useFormStatus } from "react-dom";
import { useState, type ComponentProps } from "react";
import { X } from "lucide-react";
import { Button, cn } from "@/components/ui";

/** Submit button that disables itself while its form is pending (prevents double submits). */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-disabled={pending} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/**
 * Two-step destructive button: first click arms it, second click submits.
 * No browser confirm() dialog, and it's keyboard- and screen-reader friendly.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  cancelLabel,
  description,
  className,
}: {
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  description?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed)
    return (
      <Button type="button" variant="danger" size="sm" className={className} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      {description ? <span className="text-xs text-danger">{description}</span> : null}
      <SubmitButton variant="danger" size="sm" autoFocus>
        {confirmLabel}
      </SubmitButton>
      <Button type="button" variant="ghost" size="sm" aria-label={cancelLabel} onClick={() => setArmed(false)}>
        <X aria-hidden />
      </Button>
    </span>
  );
}
