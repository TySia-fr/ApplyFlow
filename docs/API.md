# API

ApplyFlow has one first-party client (its own UI), so mutations are **Server
Actions** and reads happen in Server Components. That keeps one validation and
authorization path instead of two (see ADR-0002). The few HTTP endpoints that
exist are documented below and in [`openapi.yaml`](openapi.yaml).

## HTTP endpoints

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/health` | none | `200 {"status":"ok"}` or `503 {"status":"degraded"}` (DB unreachable) |
| GET | `/api/documents/{id}` | session cookie | file bytes as `attachment`; `401` no session, `404` missing **or not yours** |
| GET/POST | `/api/auth/*` | — | better-auth endpoints (sign-in, sign-up, sign-out, session) |
| POST | `/api/telegram/webhook` | `X-Telegram-Bot-Api-Secret-Token` | `200` after authentication (always, so Telegram doesn't redeliver); `401` bad secret; `404` bot not configured |
| POST | `/api/cron/daily` | `Authorization: Bearer <CRON_SECRET>` | runs due saved searches, sends digests; JSON summary. Blocked at Nginx |
| POST | `/api/cron/reminders` | `Authorization: Bearer <CRON_SECRET>` | sends due reminders; `{"sent": n}`. Blocked at Nginx |

## Server Actions

All live in `src/server/actions/`. Each one:

1. resolves the user from the session (`requireUser()`), never from input;
2. parses `FormData` with a Zod schema from `src/lib/validation.ts`;
3. calls a service in `src/server/services/` with that user id;
4. returns `ActionState` (`{ ok: true }` or `{ ok: false, fields?, error? }`)
   or redirects. Unknown errors are logged and returned as a generic message.

| Action | Service | Schema |
|---|---|---|
| `createApplicationAction`, `updateApplicationAction` | `createApplication`, `updateApplication` | `applicationInput` |
| `changeStatusAction` | `changeStatus` | `statusChangeInput` |
| `moveApplicationAction` (Kanban) | `moveApplication` | `moveInput` |
| `archive…`, `delete…`, `duplicateApplicationAction` | `setArchived`, `deleteApplication`, `duplicateApplication` | `{ id: uuid }` |
| `createInterviewAction`, `updateInterviewAction`, `deleteInterviewAction` | `interviews.*` | `interviewInput`, `interviewUpdateInput` |
| `createFollowUpAction`, `toggleFollowUpAction`, `deleteFollowUpAction` | `follow-ups.*` | `followUpInput` |
| `uploadDocumentAction`, `deleteDocumentAction` | `documents.*` | `documentInput` + file checks |
| `updateSettingsAction`, `changePasswordAction`, `deleteAccountAction` | `account.*` / better-auth | `settingsInput` |
| `signInAction`, `signUpAction`, `signOutAction`, `startDemoAction` | better-auth, `demo.*` | local schemas |
| `createSavedSearchAction`, `deleteSavedSearchAction`, `runSavedSearchAction`, `offerAction` | `discovery.*` | `savedSearchInput` |
| `createTelegramLinkAction`, `unlinkTelegramAction` | `telegram.*` | — |

## If a public API is needed later

The services already take `(userId, input)` and return plain data, so a
versioned REST layer (`/api/v1/...` with token auth) would be a thin adapter
over the same functions and schemas, not a rewrite.
