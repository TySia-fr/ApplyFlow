# ADR-0004: Telegram bot and job discovery

Date: 2026-11-10 · Status: accepted

## Context

Manual entry is the main reason people abandon job trackers. Users already
live in a messenger; most job hunting happens on a phone.

## Decisions

1. **Capture, never auto-apply.** The bot finds and records opportunities; it
   never submits an application for the user. Auto-applying breaks most job
   boards' terms, spams recruiters, and can't be undone when it's wrong.
2. **Telegram via webhook, not polling.** One HTTPS route
   (`/api/telegram/webhook`), authenticated by the secret Telegram sends in
   `X-Telegram-Bot-Api-Secret-Token`, compared in constant time. Always
   answers 200 after authentication so Telegram doesn't redeliver in a loop.
3. **Account linking by one-time deep link.** `t.me/<bot>?start=<token>`;
   32-char random token, only its SHA-256 stored, 15-minute expiry, consumed
   atomically (`DELETE … RETURNING`). One chat per account and vice versa.
4. **Job data from structured data only.** A shared link is parsed from the
   page's schema.org `JobPosting`. If there is none (LinkedIn blocks bots),
   the bot asks for "Title @ Company" instead of guessing from page titles.
5. **SSRF-hardened fetching** of user-supplied URLs (see SECURITY.md).
6. **Discovery from La Bonne Alternance's public API** (free, non-commercial
   use), by job family → ROME codes, département and diploma level; offers
   deduplicated per user by `(source, external_id)`.
7. **No worker container.** Two endpoints (`/api/cron/daily`,
   `/api/cron/reminders`) protected by `CRON_SECRET`, blocked at Nginx, called
   by the host's cron. A queue would add memory the VPS doesn't have for work
   that runs a few times an hour.
8. **Exactly-once notifications.** A `(user_id, key)` primary key is claimed
   before sending; a failed send releases the claim so the next run retries;
   a 403 (user blocked the bot) unlinks the chat.

## Consequences

- Everything works without Telegram or an LBA key; the UI says what is
  missing instead of failing.
- La Bonne Alternance's terms restrict use to non-profit purposes: fine for
  this portfolio project, a blocker for a paid product.
- Telegram is the only push channel; email digests would reuse the same
  services once an email provider is configured.
