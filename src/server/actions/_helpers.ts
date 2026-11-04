import "server-only";
import { notFound } from "next/navigation";
import type { z } from "zod";
import { NotFoundError, RateLimitError, ValidationError, type ActionState } from "@/server/errors";
import { errorFields, log } from "@/server/logger";
import { fieldErrors } from "@/lib/validation";

/** FormData → plain object; repeated keys keep the last value (no multi-selects in this app). */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function parse<S extends z.ZodType>(schema: S, fd: FormData | Record<string, unknown>) {
  const data = fd instanceof FormData ? formObject(fd) : fd;
  return schema.safeParse(data);
}

/**
 * Converts domain errors into the ActionState the form understands. Unknown
 * errors are logged with context and shown as a generic message: internal
 * details never reach the browser.
 */
export function toActionState(err: unknown, action: string, userId?: string): ActionState {
  if (err instanceof ValidationError) return { ok: false, fields: err.fields };
  if (err instanceof RateLimitError) return { ok: false, error: "rateLimited" };
  if (err instanceof NotFoundError) {
    log.security("authz.not_found", { action, userId });
    notFound();
  }
  // Next uses thrown errors for redirect()/notFound(); let those through.
  if (err && typeof err === "object" && "digest" in err) throw err;
  log.error("action.failed", { action, userId, ...errorFields(err) });
  return { ok: false, error: "generic" };
}

export function invalid(error: z.ZodError): ActionState {
  return { ok: false, fields: fieldErrors(error) };
}
