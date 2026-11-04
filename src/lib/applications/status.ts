export const STATUSES = [
  "interested",
  "saved",
  "preparing",
  "applied",
  "screening",
  "interview",
  "technical_assessment",
  "final_interview",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "apprenticeship",
  "freelance",
] as const;

/** Terminal statuses: the application is no longer in progress. */
export const CLOSED_STATUSES: ReadonlySet<Status> = new Set(["accepted", "rejected", "withdrawn"]);

export function isActive(status: Status): boolean {
  return !CLOSED_STATUSES.has(status);
}

/**
 * Statuses that only make sense once an application was actually submitted.
 * Used to decide whether an application counts as "submitted" even if the user
 * skipped the explicit "applied" step (e.g. moved straight from saved to interview).
 */
export const SUBMITTED_STATUSES: ReadonlySet<Status> = new Set([
  "applied",
  "screening",
  "interview",
  "technical_assessment",
  "final_interview",
  "offer",
  "accepted",
  "rejected",
]);

/** Any signal back from the employer, positive or negative. */
export const RESPONSE_STATUSES: ReadonlySet<Status> = new Set([
  "screening",
  "interview",
  "technical_assessment",
  "final_interview",
  "offer",
  "accepted",
  "rejected",
]);

export const INTERVIEW_STATUSES: ReadonlySet<Status> = new Set([
  "interview",
  "technical_assessment",
  "final_interview",
  "offer",
  "accepted",
]);

export const OFFER_STATUSES: ReadonlySet<Status> = new Set(["offer", "accepted"]);

/** Kanban column gap. New cards go to the bottom: max(position) + GAP. */
export const POSITION_GAP = 1024;
