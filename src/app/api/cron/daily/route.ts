import { env } from "@/server/env";
import { log } from "@/server/logger";
import { jobSource, secretMatches, telegram } from "@/server/integrations/wiring";
import { runDueSearches } from "@/server/services/discovery";
import { sendDigests } from "@/server/services/telegram";

/** Once a day: run saved searches, then send each linked user their new offers. */
export async function POST(req: Request) {
  if (!secretMatches(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null, env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const source = jobSource();
  const tg = telegram();
  const searches = source ? await runDueSearches(source) : null;
  const digests = tg ? await sendDigests(tg) : null;
  log.info("cron.daily", { searches, digests });
  return Response.json({ searches, digests });
}
