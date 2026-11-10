# Implementation plan

Scope is a **deep MVP**: fewer modules, each finished to the definition of done
(UI, backend, DB, validation, authorization, error states, tests, docs).

| Phase | Content | Status |
|---|---|---|
| 1. Foundation | Next.js 16, TS strict, Tailwind 4, Drizzle schema + migrations, env validation, docs | ✅ done |
| 2. Auth | better-auth email/password, secure cookies, DB-backed rate limits, no enumeration, demo sandbox with expiry | ✅ done (email verification/reset require a provider: ⚙️ config) |
| 3. Core product | applications CRUD, archive, duplicate, table with filters/sort/pagination, Kanban with persisted drag and drop, status timeline, dashboard from real events | ✅ done |
| 4. Workflow | interviews (timezone-aware) + calendar, follow-ups with overdue/today/upcoming, documents with content sniffing and private download, settings, account deletion, EN/FR | ✅ done |
| 5. Quality & delivery | 37 unit/integration tests, 9 E2E incl. axe, CI with migration drift check, Dockerfile + compose, deployment docs | ✅ done locally · ⚠️ Docker images and the VPS deploy are not verified yet |

| 6. Automation | Telegram bot (linking, capture by link, buttons, digests, reminders), job discovery via La Bonne Alternance, scheduled jobs | ✅ done locally · ⚙️ needs bot token + LBA key on the server |

## Deferred (not in MVP)

| Module from the brief | Why deferred | Prerequisite |
|---|---|---|
| Recruiter CRM (contacts, interactions) | Companies exist; contacts are a separate entity with its own UI | — |
| Analytics area with date ranges + CSV export | Dashboard covers the core metrics | — |
| In-app notification center | Telegram covers push; an in-app inbox is still missing | — |
| AI matching / cover letters / interview prep | Must not be faked; needs consent flow for CVs (RGPD) and a provider key | provider abstraction + key + consent |
| France Travail as a second discovery source | Needs OAuth client credentials | France Travail API access |
| Saved filters, bulk updates, tags | Nice-to-have on top of the list view | — |
| OAuth providers, 2FA | better-auth plugins | provider credentials |
