import { env } from "@/server/env";
import { errorFields, log } from "@/server/logger";
import { jobSource, secretMatches, telegram } from "@/server/integrations/wiring";
import { updateSchema } from "@/server/integrations/telegram";
import { fetchHtmlSafely } from "@/server/integrations/safe-fetch";
import { handleUpdate } from "@/server/services/telegram";

/**
 * Telegram calls this for every message and button press. Telegram sends the
 * secret we registered with setWebhook in X-Telegram-Bot-Api-Secret-Token;
 * anything without it is rejected before the body is read.
 */
export async function POST(req: Request) {
  const tg = telegram();
  if (!tg) return new Response("Not found", { status: 404 });
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET)) {
    log.security("telegram.bad_secret");
    return new Response("Unauthorized", { status: 401 });
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("ok"); // unknown update types are fine to ignore
  try {
    await handleUpdate(parsed.data, { tg, fetchHtml: fetchHtmlSafely, offers: jobSource() });
  } catch (err) {
    // Always 200: a non-2xx makes Telegram redeliver the same update in a loop.
    log.error("telegram.update_failed", { updateId: parsed.data.update_id, ...errorFields(err) });
  }
  return new Response("ok");
}
