"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { auth } from "@/server/auth";
import { requireUser } from "@/server/auth/current-user";
import type { ActionState } from "@/server/errors";
import { log } from "@/server/logger";
import * as interviews from "@/server/services/interviews";
import * as followUps from "@/server/services/follow-ups";
import * as documents from "@/server/services/documents";
import * as account from "@/server/services/account";
import {
  documentInput,
  followUpInput,
  interviewInput,
  interviewUpdateInput,
  settingsInput,
} from "@/lib/validation";
import { formObject, invalid, parse, toActionState } from "./_helpers";

const idForm = z.object({ id: z.uuid() });

// ─── Interviews ─────────────────────────────────────────────────────────────

export async function createInterviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parse(interviewInput, fd);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await interviews.createInterview(user.id, parsed.data);
  } catch (err) {
    return toActionState(err, "interview.create", user.id);
  }
  refresh();
  return { ok: true };
}

export async function updateInterviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parse(interviewUpdateInput, fd);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await interviews.updateInterviewOutcome(user.id, parsed.data);
  } catch (err) {
    return toActionState(err, "interview.update", user.id);
  }
  refresh();
  return { ok: true };
}

export async function deleteInterviewAction(fd: FormData) {
  const user = await requireUser();
  const parsed = parse(idForm, fd);
  if (!parsed.success) return;
  try {
    await interviews.deleteInterview(user.id, parsed.data.id);
  } catch (err) {
    toActionState(err, "interview.delete", user.id);
  }
  refresh();
}

// ─── Follow-ups ─────────────────────────────────────────────────────────────

export async function createFollowUpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parse(followUpInput, fd);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await followUps.createFollowUp(user.id, parsed.data);
  } catch (err) {
    return toActionState(err, "follow_up.create", user.id);
  }
  refresh();
  return { ok: true };
}

export async function toggleFollowUpAction(fd: FormData) {
  const user = await requireUser();
  const parsed = parse(idForm.extend({ done: z.enum(["0", "1"]) }), fd);
  if (!parsed.success) return;
  try {
    await followUps.setFollowUpDone(user.id, parsed.data.id, parsed.data.done === "1");
  } catch (err) {
    toActionState(err, "follow_up.toggle", user.id);
  }
  refresh();
}

export async function deleteFollowUpAction(fd: FormData) {
  const user = await requireUser();
  const parsed = parse(idForm, fd);
  if (!parsed.success) return;
  try {
    await followUps.deleteFollowUp(user.id, parsed.data.id);
  } catch (err) {
    toActionState(err, "follow_up.delete", user.id);
  }
  refresh();
}

// ─── Documents ──────────────────────────────────────────────────────────────

export async function uploadDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, fields: { file: "noFile" } };
  const parsed = documentInput.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);
  try {
    await documents.uploadDocument(user.id, parsed.data, new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    return toActionState(err, "document.upload", user.id);
  }
  refresh();
  return { ok: true };
}

export async function deleteDocumentAction(fd: FormData) {
  const user = await requireUser();
  const parsed = parse(idForm, fd);
  if (!parsed.success) return;
  try {
    await documents.deleteDocument(user.id, parsed.data.id);
  } catch (err) {
    toActionState(err, "document.delete", user.id);
  }
  refresh();
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function updateSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parse(settingsInput, fd);
  if (!parsed.success) return invalid(parsed.error);
  await account.updateSettings(user.id, parsed.data);
  refresh();
  return { ok: true };
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10, "min10").max(128),
});

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.isDemo) return { ok: false, error: "demo" };
  const parsed = parse(passwordSchema, fd);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await auth.api.changePassword({
      body: { ...parsed.data, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError && Number(err.statusCode) === 429) return { ok: false, error: "rateLimited" };
    if (err instanceof APIError) return { ok: false, fields: { currentPassword: "wrong" } };
    return toActionState(err, "account.password", user.id);
  }
  log.security("account.password_changed", { userId: user.id });
  return { ok: true };
}

export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (fd.get("confirm") !== "DELETE") return { ok: false, fields: { confirm: "confirm" } };
  await account.deleteAccount(user.id);
  log.security("account.deleted", { userId: user.id, demo: user.isDemo });
  redirect("/");
}
