# Implementation plan

Scope is a **deep MVP**: fewer modules, each finished to the definition of done
(UI, backend, DB, validation, authorization, error states, tests, docs).
Breadth comes after depth.

## Phase 1 — Foundation ✅ in progress
- Next.js 16 (App Router, Cache Components), TypeScript strict, Tailwind 4
- Drizzle schema + first migration, verified against PostgreSQL 16
- Environment validation (`src/server/env.ts`)
- Architecture docs and ADRs

## Phase 2 — Auth
- better-auth: email + password, secure HTTP-only cookies, session expiry
- Rate limiting stored in Postgres; generic error messages (no account enumeration)
- Email verification / password reset **only when an email provider is configured**;
  otherwise the UI states the feature is unavailable
- "Try the demo" sandbox accounts + expiry cleanup
- `getCurrentUser()` Data Access Layer

## Phase 3 — Core product
- Applications: create, edit, archive, delete, duplicate
- Table view (server-side pagination, filters, sort) and Kanban (drag and drop)
- Status transitions write `application_event` in the same transaction
- Companies (minimal, created inline from the application form)
- Dashboard: metrics computed from real rows and events, explicit empty states

## Phase 4 — Workflow
- Interviews (timezone-aware), follow-ups with overdue tracking, calendar view
- Documents: upload to S3 (type sniffing, size cap, SHA-256), signed downloads,
  resume ↔ application link
- i18n: English (default) and French, complete for every shipped screen

## Phase 5 — Quality and delivery
- Vitest unit tests (validation, metrics, transitions)
- Integration tests against a real Postgres (authorization, cross-user access)
- Playwright E2E for the main journey + axe accessibility checks
- GitHub Actions: lint, typecheck, test, build, E2E
- Dockerfile + compose; deploy to `applyflow.siavashizadi.com` on TySia

## Later (not in MVP)
Recruiter CRM · analytics area with CSV export · notification center ·
AI matching behind a provider abstraction · job discovery via official APIs
(La Bonne Alternance, France Travail). No scraping of sites that forbid it.
