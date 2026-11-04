/**
 * Domain errors thrown by services and translated once, at the action/route
 * boundary. Services never return HTTP codes or UI strings.
 */
export class NotFoundError extends Error {
  constructor(entity: string) {
    // Same error for "does not exist" and "belongs to someone else": telling
    // them apart would leak which ids exist (IDOR enumeration).
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(public readonly fields: Record<string, string>) {
    super("Validation failed");
    this.name = "ValidationError";
  }
}

export class RateLimitError extends Error {
  constructor() {
    super("Rate limited");
    this.name = "RateLimitError";
  }
}

/** Shape every form-backed Server Action returns. */
export type ActionState =
  | { ok: true; message?: string }
  | { ok: false; error?: string; fields?: Record<string, string> }
  | null;
