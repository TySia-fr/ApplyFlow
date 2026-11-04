"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { emailEnabled, env } from "@/server/env";
import type { ActionState } from "@/server/errors";
import { errorFields, log } from "@/server/logger";
import { consumeRateLimit, purgeExpiredDemos } from "@/server/services/account";
import { demoCredentials, markAsDemo, seedDemoData } from "@/server/services/demo";
import { invalid, parse } from "./_helpers";

const signInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

const signUpSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  password: z.string().min(10).max(128),
});

function statusOf(err: unknown): number | undefined {
  return err instanceof APIError ? Number(err.statusCode) : undefined;
}

export async function signInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parse(signInSchema, fd);
  // Same message for malformed input and wrong credentials: no hints for enumeration.
  if (!parsed.success) return { ok: false, error: "invalidCredentials" };
  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (err) {
    const status = statusOf(err);
    if (status === 429) return { ok: false, error: "tooMany" };
    if (status === 403) return { ok: false, error: "verifyEmail" };
    if (status === 401 || status === 400) {
      log.security("auth.sign_in_failed");
      return { ok: false, error: "invalidCredentials" };
    }
    log.error("auth.sign_in_error", errorFields(err));
    return { ok: false, error: "generic" };
  }
  redirect("/app");
}

export async function signUpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parse(signUpSchema, fd);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
  } catch (err) {
    const status = statusOf(err);
    if (status === 429) return { ok: false, error: "tooMany" };
    // Existing email: generic message, never "this email is taken".
    if (status === 422 || status === 400) return { ok: false, error: "signUpFailed" };
    log.error("auth.sign_up_error", errorFields(err));
    return { ok: false, error: "generic" };
  }
  if (emailEnabled) return { ok: true, message: "verifyEmail" };
  redirect("/app");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

/**
 * Creates an isolated sandbox user with sample data and signs them in.
 * Limited per IP so the demo can't be used to fill the database.
 */
export async function startDemoAction(): Promise<ActionState> {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    if (!(await consumeRateLimit(`demo:${ip}`, env.DEMO_RATE_LIMIT_PER_HOUR, 3600))) {
      log.security("demo.rate_limited", { ip });
      return { ok: false, error: "tooMany" };
    }
    await purgeExpiredDemos();
    const creds = demoCredentials();
    const res = await auth.api.signUpEmail({
      body: { name: "Demo user", email: creds.email, password: creds.password },
    });
    await markAsDemo(res.user.id);
    await seedDemoData(res.user.id);
    await auth.api.signInEmail({ body: creds, headers: h });
    log.info("demo.started", { userId: res.user.id });
  } catch (err) {
    log.error("demo.failed", errorFields(err));
    return { ok: false, error: "demoFailed" };
  }
  redirect("/app");
}
