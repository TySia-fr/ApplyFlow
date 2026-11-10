import { env } from "@/server/env";
import { log } from "@/server/logger";
import { secretMatches, telegram } from "@/server/integrations/wiring";
import { sendReminders } from "@/server/services/telegram";

/** Every 15 minutes: interview and follow-up reminders, each sent at most once. */
export async function POST(req: Request) {
  if (!secretMatches(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null, env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const tg = telegram();
  const result = tg ? await sendReminders(tg) : { sent: 0, disabled: true };
  if (result.sent) log.info("cron.reminders", result);
  return Response.json(result);
}
