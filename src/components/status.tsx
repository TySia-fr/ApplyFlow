import type { Status } from "@/lib/applications/status";
import type { Dictionary } from "@/lib/i18n";
import { Badge, type Tone } from "@/components/ui";

const TONE: Record<Status, Tone> = {
  interested: "neutral",
  saved: "neutral",
  preparing: "warning",
  applied: "info",
  screening: "info",
  interview: "violet",
  technical_assessment: "violet",
  final_interview: "violet",
  offer: "success",
  accepted: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

export function statusTone(s: Status): Tone {
  return TONE[s];
}

export function StatusBadge({ status, dict }: { status: Status; dict: Dictionary }) {
  return <Badge tone={TONE[status]}>{dict.status[status]}</Badge>;
}

export function PriorityMark({ priority, dict }: { priority: "low" | "medium" | "high"; dict: Dictionary }) {
  const bars = { low: 1, medium: 2, high: 3 }[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={dict.priority[priority]}>
      <span aria-hidden className="inline-flex items-end gap-px">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-[3px] rounded-[1px] ${i <= bars ? "bg-fg" : "bg-border-strong"}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      <span>{dict.priority[priority]}</span>
    </span>
  );
}
