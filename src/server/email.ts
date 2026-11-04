import "server-only";
import { emailEnabled, env } from "@/server/env";
import { errorFields, log } from "@/server/logger";

/**
 * Sends through Resend's HTTP API (no SDK needed). Only called when
 * RESEND_API_KEY is configured; callers check `emailEnabled` first.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<void> {
  if (!emailEnabled) throw new Error("Email is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.error("email.send_failed", { status: res.status, body: body.slice(0, 500) });
    throw new Error(`Email provider returned ${res.status}`);
  }
}

export async function trySendEmail(msg: { to: string; subject: string; text: string }): Promise<boolean> {
  try {
    await sendEmail(msg);
    return true;
  } catch (err) {
    log.error("email.error", errorFields(err));
    return false;
  }
}
