# Project progress

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
