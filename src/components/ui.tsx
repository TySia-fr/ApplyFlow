import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:opacity-90",
        secondary: "border border-border bg-surface text-fg shadow-xs hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        danger: "border border-border bg-surface text-danger hover:bg-danger-soft",
      },
      size: { sm: "h-7 px-2.5 text-[13px]", md: "h-8 px-3", lg: "h-10 px-4" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ComponentProps<"button"> & ButtonVariants) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function ButtonLink({ className, variant, size, ...props }: ComponentProps<typeof Link> & ButtonVariants) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

const control =
  "w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg shadow-xs placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 aria-invalid:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-8 pr-7", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium text-fg", className)} {...props} />;
}

/** Label + control + error, wired with ids so screen readers announce the error. */
export function Field({
  label,
  name,
  error,
  hint,
  optionalLabel,
  className,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  optionalLabel?: string;
  className?: string;
  children: (props: { id: string; name: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = `f-${name}`;
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optionalLabel ? <span className="ml-1 font-normal text-muted">({optionalLabel})</span> : null}
      </Label>
      {children({ id, name, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-border bg-surface", className)} {...props} />;
}

export function PanelHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
      <h2 className="text-[13px] font-medium text-fg">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-muted [&_svg]:size-6">{icon}</div> : null}
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const tone = {
  neutral: "bg-surface-2 text-muted",
  info: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  accent: "bg-accent-soft text-accent",
} as const;

export type Tone = keyof typeof tone;

export function Badge({ tone: t = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex h-5 items-center rounded-sm px-1.5 text-xs font-medium whitespace-nowrap", tone[t], className)}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function Alert({ tone: t = "danger", children }: { tone?: "danger" | "success" | "info"; children: ReactNode }) {
  return (
    <div role={t === "danger" ? "alert" : "status"} className={cn("rounded-md px-3 py-2 text-sm", tone[t])}>
      {children}
    </div>
  );
}
