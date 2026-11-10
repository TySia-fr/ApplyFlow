# Project progress

## 2026-11-10 — Telegram bot and job discovery

- Discover page: saved searches on La Bonne Alternance, offers deduplicated
  per user, add to pipeline / dismiss / restore; labelled sample offers in demo
- Telegram bot @ApplyFlowAppBot: one-time deep-link account linking, add a job
  by sending its link (schema.org JobPosting, else asks "Title @ Company"),
  inline buttons, /today, /unlink; EN/FR
- Scheduled jobs via host cron: daily searches + digests, reminders every 15 min
- SSRF-hardened URL fetching; migration 0003 (hand-edited SET NULL (column))
- Deployment: setup-integrations.sh, cron.sh, /api/cron blocked at Nginx
- Results: Vitest 68/68, Playwright 12/12

## 2026-11-05 — Polish

- Board: empty and closed columns collapse to drop-target strips; "Show
  closed" toggle remembered per browser; board uses full width on large screens
- Dashboard: the three rates in one compact panel, definitions in a disclosure;
  compact stats and chart on mobile
- Landing: framed product screenshot, how-it-works, engineering section, CTA
- Fixed: intermittent duplicate-key error in the demo rate limiter (migration 0002)
- Results: Vitest 37/37 (15 consecutive runs), Playwright 9/9

## 2026-11-04 — MVP

### Done (implemented and tested)
- Auth: sign-up, sign-in, sign-out, password change (revokes other sessions),
  account deletion with file cleanup, rate limits, generic errors
- Demo sandbox: isolated seeded account, 24 h expiry, per-IP limit, purge
- Applications: create, edit, archive/restore, duplicate, delete; table with
  search, status/priority filters, four sorts, pagination; Kanban with
  optimistic, persisted drag and drop; status timeline with notes
- Dashboard: counts, response/interview/offer rates from event history with
  small-sample warnings, weekly chart, status distribution, upcoming
  interviews, due follow-ups, recent activity, empty state
- Interviews: timezone-aware scheduling, outcome and feedback, list, month calendar
- Follow-ups: per application or general, overdue/today/upcoming/done
- Documents: upload with content sniffing and size cap, versioning by title,
  attach a resume to an application, authorized download, delete
- Settings: name, language (EN/FR), timezone
- Design system: tokens, light/dark (system), responsive, accessible forms
- CI workflow, Dockerfile, compose, docs, ADR-0001…0003

### Test results (actually run)
- Vitest: 37/37 passed (unit + integration on PostgreSQL 16)
- Playwright: 9/9 passed against the production build (desktop + mobile, axe)

### Bugs found by tests and fixed
- Enum array parsing crash on the dashboard
- Timeline misordering under concurrent status changes (`clock_timestamp()`, migration 0001)
- Drag by title impossible; drops landing in the neighbouring column

### Not verified
- Docker image build and compose stack (no Docker daemon in the dev environment)
- Deployment on the VPS
- First CI run on GitHub (workflow validated as YAML; runs on push)

### Known limitations
See SECURITY.md (CSP inline scripts, no email provider, no 2FA) and
IMPLEMENTATION_PLAN.md (deferred modules).
