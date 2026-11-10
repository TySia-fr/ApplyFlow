import "server-only";
import { z } from "zod";

/** Inline keyboard: rows of buttons, each either a callback or a URL. */
export type Button = { text: string; callback_data: string } | { text: string; url: string };
export type Keyboard = Button[][];

export interface Telegram {
  sendMessage(chatId: number, html: string, keyboard?: Keyboard): Promise<void>;
  answerCallback(callbackId: string, text?: string): Promise<void>;
  editKeyboard(chatId: number, messageId: number, keyboard: Keyboard): Promise<void>;
}

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

/** Escapes text for Telegram's HTML parse mode. Every user/offer value goes through this. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class TelegramHttp implements Telegram {
  constructor(private readonly token: string) {}

  private async call(method: string, body: Record<string, unknown>) {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; error_code?: number };
    // The token is part of the URL: never include the URL in errors or logs.
    if (!json.ok) throw new TelegramError(json.description ?? `HTTP ${res.status}`, json.error_code ?? res.status);
  }

  async sendMessage(chatId: number, html: string, keyboard?: Keyboard) {
    await this.call("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }

  async answerCallback(callbackId: string, text?: string) {
    await this.call("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) });
  }

  async editKeyboard(chatId: number, messageId: number, keyboard: Keyboard) {
    await this.call("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } });
  }
}

/** The subset of a Telegram Update this bot reads. Everything else is ignored. */
const chat = z.object({ id: z.number(), type: z.string() });
const from = z.object({ id: z.number(), username: z.string().optional(), language_code: z.string().optional() });

export const updateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({ message_id: z.number(), chat, from: from.optional(), text: z.string().max(4096).optional() })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from,
      data: z.string().max(64).optional(),
      message: z.object({ message_id: z.number(), chat }).optional(),
    })
    .optional(),
});

export type Update = z.infer<typeof updateSchema>;

/** Callback payloads, kept under Telegram's 64-byte limit. */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export type Callback = { kind: "offer_add" | "offer_dismiss" | "app_applied"; id: string };

export function encodeCallback(c: Callback): string {
  return `${{ offer_add: "oa", offer_dismiss: "od", app_applied: "ap" }[c.kind]}:${c.id}`;
}

export function decodeCallback(data: string | undefined): Callback | null {
  const m = new RegExp(`^(oa|od|ap):(${UUID})$`).exec(data ?? "");
  if (!m) return null;
  const kind = ({ oa: "offer_add", od: "offer_dismiss", ap: "app_applied" } as const)[m[1] as "oa" | "od" | "ap"];
  return { kind, id: m[2] as string };
}
