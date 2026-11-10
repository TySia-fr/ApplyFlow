"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { RateLimitError, type ActionState } from "@/server/errors";
import { log } from "@/server/logger";
import { jobSource } from "@/server/integrations/wiring";
import { env, telegramEnabled } from "@/server/env";
import * as discovery from "@/server/services/discovery";
import * as tgService from "@/server/services/telegram";
import { savedSearchInput } from "@/lib/discovery";
import { formObject, invalid, parse, toActionState } from "./_helpers";

const idForm = z.object({ id: z.uuid() });

export async function createSavedSearchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  // Checkboxes repeat the same key: read all of them, not just the last.
  const parsed = savedSearchInput.safeParse({ ...formObject(fd), families: fd.getAll("families") });
  if (!parsed.success) return invalid(parsed.error);
  try {
    await discovery.createSavedSearch(user.id, parsed.data);
  } catch (err) {
    return toActionState(err, "discovery.create", user.id);
  }
  refresh();
  return { ok: true };
}

export async function deleteSavedSearchAction(fd: FormData) {
  const user = await requireUser();
  const parsed = parse(idForm, fd);
  if (!parsed.success) return;
  try {
    await discovery.deleteSavedSearch(user.id, parsed.data.id);
  } catch (err) {
    toActionState(err, "discovery.delete", user.id);
  }
  refresh();
}

export type RunState = { ok: true; found: number; added: number } | { ok: false; error: string } | null;

export async function runSavedSearchAction(_: RunState, fd: FormData): Promise<RunState> {
  const user = await requireUser();
  const parsed = parse(idForm, fd);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const source = jobSource();
  if (!source) return { ok: false, error: "notConfigured" };
  try {
    const r = await discovery.runSavedSearchNow(user.id, parsed.data.id, source);
    refresh();
    return { ok: true, ...r };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: "rateLimited" };
    const state = toActionState(err, "discovery.run", user.id);
    return { ok: false, error: state && !state.ok && state.error === "generic" ? (err as Error).message.slice(0, 120) : "invalid" };
  }
}

export async function offerAction(fd: FormData) {
  const user = await requireUser();
  const parsed = parse(idForm.extend({ op: z.enum(["add", "dismiss", "restore"]) }), fd);
  if (!parsed.success) return;
  let appId: string | undefined;
  try {
    if (parsed.data.op === "add") appId = await discovery.addOfferToPipeline(user.id, parsed.data.id);
    else await discovery.setOfferDismissed(user.id, parsed.data.id, parsed.data.op === "dismiss");
  } catch (err) {
    toActionState(err, "discovery.offer", user.id);
  }
  if (appId) redirect(`/app/applications/${appId}`);
  refresh();
}

export type LinkState = { ok: true; url: string } | { ok: false; error: string } | null;

export async function createTelegramLinkAction(): Promise<LinkState> {
  const user = await requireUser();
  if (user.isDemo) return { ok: false, error: "demo" };
  if (!telegramEnabled || !env.TELEGRAM_BOT_USERNAME) return { ok: false, error: "notConfigured" };
  const token = await tgService.createLinkToken(user.id);
  return { ok: true, url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}` };
}

export async function unlinkTelegramAction() {
  const user = await requireUser();
  await tgService.unlinkUser(user.id);
  log.security("telegram.unlinked", { userId: user.id });
  refresh();
}
