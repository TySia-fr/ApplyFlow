import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { LbaClient, type JobSource, type OfferLookup } from "@/server/integrations/lba";
import { TelegramHttp, type Telegram } from "@/server/integrations/telegram";

/** Real clients from configuration; null when the integration isn't configured. */
export function jobSource(): (JobSource & OfferLookup) | null {
  return env.LBA_API_KEY ? new LbaClient({ baseUrl: env.LBA_API_BASE_URL, apiKey: env.LBA_API_KEY }) : null;
}

export function telegram(): Telegram | null {
  return env.TELEGRAM_BOT_TOKEN ? new TelegramHttp(env.TELEGRAM_BOT_TOKEN) : null;
}

/** Constant-time comparison so a secret can't be guessed byte by byte from response timing. */
export function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
