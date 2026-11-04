"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import type { ActionState } from "@/server/errors";
import * as svc from "@/server/services/applications";
import { applicationInput, moveInput, statusChangeInput } from "@/lib/validation";
import { invalid, parse, toActionState } from "./_helpers";

// Every action re-resolves the user from the session cookie. The client
// never supplies a userId, and UI checks are not authorization.

export async function createApplicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parse(applicationInput, fd);
  if (!parsed.success) return invalid(parsed.error);
  let id: string;
  try {
    id = await svc.createApplication(user.id, parsed.data);
  } catch (err) {
    return toActionState(err, "application.create", user.id);
  }
  redirect(`/app/applications/${id}`);
}

export async function updateApplicationAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "generic" };
  const parsed = parse(applicationInput, fd);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await svc.updateApplication(user.id, id, parsed.data);
  } catch (err) {
    return toActionState(err, "application.update", user.id);
  }
  redirect(`/app/applications/${id}`);
}

export async function changeStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parse(statusChangeInput, fd);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await svc.changeStatus(user.id, parsed.data.applicationId, parsed.data.status, parsed.data.note);
  } catch (err) {
    return toActionState(err, "application.status", user.id);
  }
  refresh();
  return { ok: true };
}

/** Called by the Kanban board after a drop. Returns ok:false so the board can roll back. */
export async function moveApplicationAction(input: z.input<typeof moveInput>): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = moveInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    await svc.moveApplication(user.id, parsed.data.applicationId, parsed.data.status, parsed.data.beforeId);
    return { ok: true };
  } catch (err) {
    toActionState(err, "application.move", user.id);
    return { ok: false };
  }
}

const idForm = z.object({ id: z.uuid() });

export async function archiveApplicationAction(fd: FormData) {
  const user = await requireUser();
  const parsed = parse(idForm.extend({ archived: z.enum(["0", "1"]) }), fd);
  if (!parsed.success) return;
  try {
    await svc.setArchived(user.id, parsed.data.id, parsed.data.archived === "1");
  } catch (err) {
    toActionState(err, "application.archive", user.id);
  }
  refresh();
}

export async function deleteApplicationAction(fd: FormData) {
  const user = await requireUser();
  const parsed = parse(idForm, fd);
  if (!parsed.success) return;
  try {
    await svc.deleteApplication(user.id, parsed.data.id);
  } catch (err) {
    toActionState(err, "application.delete", user.id);
  }
  redirect("/app/applications");
}

export async function duplicateApplicationAction(fd: FormData) {
  const user = await requireUser();
  const parsed = parse(idForm, fd);
  if (!parsed.success) return;
  let id: string;
  try {
    id = await svc.duplicateApplication(user.id, parsed.data.id);
  } catch (err) {
    toActionState(err, "application.duplicate", user.id);
    return;
  }
  redirect(`/app/applications/${id}/edit`);
}
